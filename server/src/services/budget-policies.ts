import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  budgetPolicies,
  costEvents,
  limitBreachEvents,
  projects,
} from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import { notifyLimitBreach } from "./limit-breach-notify.js";
import type {
  BudgetPolicyOnExceed,
  BudgetPolicyPeriod,
  BudgetPolicyScopeType,
} from "@paperclipai/shared";

/** 與 cost 服務一致：以 UTC 曆月為窗。 */
export function utcMonthRangeForDate(d: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  to.setUTCMilliseconds(-1);
  return { from, to };
}

async function sumSpendCentsInRange(
  db: Db,
  companyId: string,
  opts: {
    from: Date;
    to: Date;
    projectId?: string | null;
    billingCode?: string | null;
    companyWide?: boolean;
  },
): Promise<number> {
  const conditions = [
    eq(costEvents.companyId, companyId),
    gte(costEvents.occurredAt, opts.from),
    lte(costEvents.occurredAt, opts.to),
  ];
  if (opts.companyWide) {
    // 全公司加總
  } else if (opts.projectId) {
    conditions.push(eq(costEvents.projectId, opts.projectId));
  } else if (opts.billingCode != null) {
    conditions.push(eq(costEvents.billingCode, opts.billingCode));
  }

  const [row] = await db
    .select({
      sum: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
    })
    .from(costEvents)
    .where(and(...conditions));
  return Number(row?.sum ?? 0);
}

export function budgetPolicyService(db: Db) {
  return {
    list: async (companyId: string) => {
      return db
        .select()
        .from(budgetPolicies)
        .where(eq(budgetPolicies.companyId, companyId))
        .orderBy(asc(budgetPolicies.scopeType), asc(budgetPolicies.createdAt));
    },

    getById: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, companyId), eq(budgetPolicies.id, id)))
        .then((rows) => rows[0] ?? null);
      return row;
    },

    create: async (
      companyId: string,
      input: {
        scopeType: BudgetPolicyScopeType;
        projectId?: string | null;
        billingCode?: string | null;
        limitCents: number;
        period?: BudgetPolicyPeriod;
        onExceed?: BudgetPolicyOnExceed;
        enabled?: boolean;
      },
    ) => {
      const scopeType = input.scopeType;
      if (scopeType === "project") {
        if (!input.projectId) throw unprocessable("project scope requires projectId");
        const proj = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!proj) throw unprocessable("Project not found in company");
      } else if (scopeType === "billing_code") {
        const code = input.billingCode?.trim();
        if (!code) throw unprocessable("billing_code scope requires non-empty billingCode");
      } else if (scopeType === "company") {
        if (input.projectId || input.billingCode) {
          throw unprocessable("company scope must not set projectId or billingCode");
        }
      }

      const now = new Date();
      const rows = await db
        .insert(budgetPolicies)
        .values({
          companyId,
          scopeType,
          projectId: scopeType === "project" ? input.projectId! : null,
          billingCode:
            scopeType === "billing_code" ? input.billingCode!.trim() : null,
          limitCents: Math.max(0, Math.floor(input.limitCents)),
          period: input.period ?? "calendar_month_utc",
          onExceed: input.onExceed ?? "record_only",
          enabled: input.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return rows[0]!;
    },

    update: async (
      companyId: string,
      id: string,
      input: Partial<{
        limitCents: number;
        onExceed: BudgetPolicyOnExceed;
        enabled: boolean;
      }>,
    ) => {
      const existing = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, companyId), eq(budgetPolicies.id, id)))
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;

      const now = new Date();
      const rows = await db
        .update(budgetPolicies)
        .set({
          ...(typeof input.limitCents === "number"
            ? { limitCents: Math.max(0, Math.floor(input.limitCents)) }
            : {}),
          ...(input.onExceed != null ? { onExceed: input.onExceed } : {}),
          ...(input.enabled != null ? { enabled: input.enabled } : {}),
          updatedAt: now,
        })
        .where(and(eq(budgetPolicies.companyId, companyId), eq(budgetPolicies.id, id)))
        .returning();
      return rows[0] ?? null;
    },

    delete: async (companyId: string, id: string) => {
      const rows = await db
        .delete(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, companyId), eq(budgetPolicies.id, id)))
        .returning({ id: budgetPolicies.id });
      return rows[0] != null;
    },

    /**
     * 成本入帳後評估：僅在「本次事件使該 scope 由未超標變為已超標」時寫入 breach，並依 on_exceed 暫停代理。
     */
    evaluateAfterCostEvent: async (params: {
      companyId: string;
      costEvent: {
        id: string;
        agentId: string;
        projectId: string | null;
        billingCode: string | null;
        costCents: number;
        occurredAt: Date;
      };
    }) => {
      const { companyId, costEvent: ev } = params;
      const { from: monthFrom, to: monthTo } = utcMonthRangeForDate(ev.occurredAt);

      const policies = await db
        .select()
        .from(budgetPolicies)
        .where(and(eq(budgetPolicies.companyId, companyId), eq(budgetPolicies.enabled, true)));

      for (const policy of policies) {
        if (policy.period !== "calendar_month_utc") continue;

        let match = false;
        if (policy.scopeType === "company") {
          match = true;
        } else if (policy.scopeType === "project") {
          match = Boolean(ev.projectId && policy.projectId && ev.projectId === policy.projectId);
        } else if (policy.scopeType === "billing_code") {
          const pc = policy.billingCode?.trim() ?? "";
          const ec = ev.billingCode?.trim() ?? "";
          match = Boolean(pc && ec && pc === ec);
        }

        if (!match) continue;

        const totalAfter = await sumSpendCentsInRange(db, companyId, {
          from: monthFrom,
          to: monthTo,
          projectId: policy.scopeType === "project" ? policy.projectId : undefined,
          billingCode: policy.scopeType === "billing_code" ? policy.billingCode : undefined,
          companyWide: policy.scopeType === "company",
        });

        const totalBefore = totalAfter - ev.costCents;
        const limit = policy.limitCents;
        if (totalBefore >= limit || totalAfter < limit) continue;

        const [existingBreach] = await db
          .select({ id: limitBreachEvents.id })
          .from(limitBreachEvents)
          .where(
            and(
              eq(limitBreachEvents.companyId, companyId),
              eq(limitBreachEvents.type, "budget_policy_breach"),
              gte(limitBreachEvents.occurredAt, monthFrom),
              sql`(${limitBreachEvents.details}->>'policyId') = ${policy.id}`,
            ),
          )
          .limit(1);

        if (existingBreach) continue;

        const [breachRow] = await db
          .insert(limitBreachEvents)
          .values({
            companyId,
            type: "budget_policy_breach",
            occurredAt: new Date(),
            amountCents: totalAfter,
            tokenUsage: null,
            agentId: policy.onExceed === "pause_agents" ? ev.agentId : null,
            details: {
              policyId: policy.id,
              scopeType: policy.scopeType,
              limitCents: limit,
              spentCents: totalAfter,
              costEventId: ev.id,
              onExceed: policy.onExceed,
            },
          })
          .returning();
        if (breachRow) {
          await notifyLimitBreach(db, companyId, {
            id: breachRow.id,
            type: breachRow.type,
            details: (breachRow.details as Record<string, unknown> | null) ?? null,
          });
          const { automationRuleService } = await import("./automation-rules.js");
          await automationRuleService(db).evaluateBudgetPolicyBreach({
            companyId,
            policyId: policy.id,
            breachEventId: breachRow.id,
            agentId: ev.agentId,
          });
        }

        if (policy.onExceed === "pause_agents") {
          const agentRow = await db
            .select()
            .from(agents)
            .where(eq(agents.id, ev.agentId))
            .then((rows) => rows[0] ?? null);
          if (
            agentRow &&
            agentRow.companyId === companyId &&
            agentRow.status !== "paused" &&
            agentRow.status !== "terminated"
          ) {
            await db
              .update(agents)
              .set({ status: "paused", autoPauseReason: "budget_policy", updatedAt: new Date() })
              .where(eq(agents.id, ev.agentId));
          }
        }
      }
    },

    /**
     * 專案範圍：若存在 block 策略且當月已達上限，應阻擋新 run。
     */
    isProjectScopeBlocking: async (companyId: string, projectId: string, at: Date) => {
      const { from, to } = utcMonthRangeForDate(at);
      const [policy] = await db
        .select()
        .from(budgetPolicies)
        .where(
          and(
            eq(budgetPolicies.companyId, companyId),
            eq(budgetPolicies.enabled, true),
            eq(budgetPolicies.scopeType, "project"),
            eq(budgetPolicies.projectId, projectId),
            eq(budgetPolicies.onExceed, "block_new_runs_for_scope"),
          ),
        )
        .limit(1);
      if (!policy) return false;

      const spent = await sumSpendCentsInRange(db, companyId, {
        from,
        to,
        projectId,
      });
      return spent >= policy.limitCents;
    },

    /**
     * 公司範圍 block 策略：當月全公司花費達上限時阻擋新 run。
     */
    isCompanyScopeBlocking: async (companyId: string, at: Date) => {
      const { from, to } = utcMonthRangeForDate(at);
      const [policy] = await db
        .select()
        .from(budgetPolicies)
        .where(
          and(
            eq(budgetPolicies.companyId, companyId),
            eq(budgetPolicies.enabled, true),
            eq(budgetPolicies.scopeType, "company"),
            eq(budgetPolicies.onExceed, "block_new_runs_for_scope"),
          ),
        )
        .limit(1);
      if (!policy) return false;

      const spent = await sumSpendCentsInRange(db, companyId, {
        from,
        to,
        companyWide: true,
      });
      return spent >= policy.limitCents;
    },

    /**
     * billing code 阻擋：僅當 context 帶有相同 billingCode 且該 scope 已超標。
     */
    isBillingCodeScopeBlocking: async (
      companyId: string,
      billingCode: string,
      at: Date,
    ) => {
      const trimmed = billingCode.trim();
      if (!trimmed) return false;
      const { from, to } = utcMonthRangeForDate(at);
      const [policy] = await db
        .select()
        .from(budgetPolicies)
        .where(
          and(
            eq(budgetPolicies.companyId, companyId),
            eq(budgetPolicies.enabled, true),
            eq(budgetPolicies.scopeType, "billing_code"),
            eq(budgetPolicies.billingCode, trimmed),
            eq(budgetPolicies.onExceed, "block_new_runs_for_scope"),
          ),
        )
        .limit(1);
      if (!policy) return false;

      const spent = await sumSpendCentsInRange(db, companyId, {
        from,
        to,
        billingCode: trimmed,
      });
      return spent >= policy.limitCents;
    },
  };
}
