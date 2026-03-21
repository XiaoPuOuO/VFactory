import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  activityLog,
  agents,
  companies,
  costEvents,
  heartbeatRuns,
  issues,
  limitBreachEvents,
  projects,
} from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import { budgetPolicyService } from "./budget-policies.js";

export interface CostDateRange {
  from?: Date;
  to?: Date;
}

/** 當月 UTC 的起訖日（用於 Token/Price Limit 與 breach 判斷）。 */
function currentMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  to.setUTCMilliseconds(-1);
  return { from, to };
}

/** 過去 N 天的起訖。 */
function pastDaysRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from, to };
}

export function costService(db: Db) {
  const budgetPolicies = budgetPolicyService(db);
  return {
    createEvent: async (companyId: string, data: Omit<typeof costEvents.$inferInsert, "companyId">) => {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, data.agentId))
        .then((rows) => rows[0] ?? null);

      if (!agent) throw notFound("Agent not found");
      if (agent.companyId !== companyId) {
        throw unprocessable("Agent does not belong to company");
      }

      const event = await db
        .insert(costEvents)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]);

      await db
        .update(agents)
        .set({
          spentMonthlyCents: sql`${agents.spentMonthlyCents} + ${event.costCents}`,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, event.agentId));

      await db
        .update(companies)
        .set({
          spentMonthlyCents: sql`${companies.spentMonthlyCents} + ${event.costCents}`,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      const updatedAgent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, event.agentId))
        .then((rows) => rows[0] ?? null);

      if (
        updatedAgent &&
        updatedAgent.budgetMonthlyCents > 0 &&
        updatedAgent.spentMonthlyCents >= updatedAgent.budgetMonthlyCents &&
        updatedAgent.status !== "paused" &&
        updatedAgent.status !== "terminated"
      ) {
        await db
          .update(agents)
          .set({ status: "paused", autoPauseReason: "budget_limit", updatedAt: new Date() })
          .where(eq(agents.id, updatedAgent.id));
        const { from } = currentMonthRange();
        await db.insert(limitBreachEvents).values({
          companyId,
          type: "budget_breach",
          occurredAt: new Date(),
          amountCents: updatedAgent.spentMonthlyCents,
          tokenUsage: null,
          agentId: updatedAgent.id,
          details: { agentName: updatedAgent.name },
        });
      }

      const { from: monthStart } = currentMonthRange();
      const companyRow = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (companyRow) {
        const [usage] = await db
          .select({
            spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
            tokenUsage: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.outputTokens}), 0)::int`,
          })
          .from(costEvents)
          .where(
            and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, monthStart)),
          );
        const spendCents = Number(usage.spendCents);
        const tokenUsage = Number(usage.tokenUsage);
        const tokenLimit = companyRow.tokenLimit != null ? Number(companyRow.tokenLimit) : null;
        const priceLimitCents = companyRow.priceLimitCents ?? null;

        if (tokenLimit != null && tokenUsage >= tokenLimit) {
          const [existing] = await db
            .select({ id: limitBreachEvents.id })
            .from(limitBreachEvents)
            .where(
              and(
                eq(limitBreachEvents.companyId, companyId),
                eq(limitBreachEvents.type, "token_limit_breach"),
                gte(limitBreachEvents.occurredAt, monthStart),
              ),
            )
            .limit(1);
          if (!existing) {
            await db.insert(limitBreachEvents).values({
              companyId,
              type: "token_limit_breach",
              occurredAt: new Date(),
              amountCents: null,
              tokenUsage,
              agentId: null,
              details: { tokenLimit },
            });
          }
        }
        if (priceLimitCents != null && spendCents >= priceLimitCents) {
          const [existing] = await db
            .select({ id: limitBreachEvents.id })
            .from(limitBreachEvents)
            .where(
              and(
                eq(limitBreachEvents.companyId, companyId),
                eq(limitBreachEvents.type, "price_limit_breach"),
                gte(limitBreachEvents.occurredAt, monthStart),
              ),
            )
            .limit(1);
          if (!existing) {
            await db.insert(limitBreachEvents).values({
              companyId,
              type: "price_limit_breach",
              occurredAt: new Date(),
              amountCents: spendCents,
              tokenUsage: null,
              agentId: null,
              details: { priceLimitCents },
            });
          }
        }
      }

      await budgetPolicies.evaluateAfterCostEvent({
        companyId,
        costEvent: {
          id: event.id,
          agentId: event.agentId,
          projectId: event.projectId ?? null,
          billingCode: event.billingCode ?? null,
          costCents: event.costCents,
          occurredAt: event.occurredAt,
        },
      });

      return event;
    },

    /** 取得公司當月使用量（用於 Limit 檢查與 dashboard）。 */
    getCompanyUsageForMonth: async (companyId: string) => {
      const { from } = currentMonthRange();
      const [row] = await db
        .select({
          spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          tokenUsage: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(
          and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, from)),
        );
      return {
        spendCents: Number(row?.spendCents ?? 0),
        tokenUsage: Number(row?.tokenUsage ?? 0),
      };
    },

    /** 公司是否已達 Token 或 Price 上限（任一達即 true）。用於阻擋新 run 與 UI badge。 */
    isCompanyLimitExceeded: async (
      companyId: string,
    ): Promise<{ token: boolean; price: boolean; reason: "token_limit" | "price_limit" | null }> => {
      const company = await db
        .select({
          tokenLimit: companies.tokenLimit,
          priceLimitCents: companies.priceLimitCents,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) return { token: false, price: false, reason: null };
      const { from } = currentMonthRange();
      const [usage] = await db
        .select({
          spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          tokenUsage: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(
          and(eq(costEvents.companyId, companyId), gte(costEvents.occurredAt, from)),
        );
      const spendCents = Number(usage?.spendCents ?? 0);
      const tokenUsage = Number(usage?.tokenUsage ?? 0);
      const tokenLimit = company.tokenLimit != null ? Number(company.tokenLimit) : null;
      const priceLimitCents = company.priceLimitCents ?? null;
      const tokenExceeded = tokenLimit != null && tokenUsage >= tokenLimit;
      const priceExceeded = priceLimitCents != null && spendCents >= priceLimitCents;
      const reason =
        tokenExceeded ? "token_limit" : priceExceeded ? "price_limit" : null;
      return {
        token: tokenExceeded,
        price: priceExceeded,
        reason,
      };
    },

    summary: async (
      companyId: string,
      range?: CostDateRange,
      opts?: { breachEventsDays?: number },
    ) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const [totals] = await db
        .select({
          spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          tokenUsage: sql<number>`coalesce(sum(${costEvents.inputTokens} + ${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(and(...conditions));

      const spendCents = Number(totals?.spendCents ?? 0);
      const tokenUsage = Number(totals?.tokenUsage ?? 0);
      const utilization =
        company.budgetMonthlyCents > 0
          ? (spendCents / company.budgetMonthlyCents) * 100
          : 0;

      const breachDays = opts?.breachEventsDays ?? 90;
      const { from: breachFrom } = pastDaysRange(breachDays);
      const breachRows = await db
        .select()
        .from(limitBreachEvents)
        .where(
          and(
            eq(limitBreachEvents.companyId, companyId),
            gte(limitBreachEvents.occurredAt, breachFrom),
          ),
        )
        .orderBy(desc(limitBreachEvents.occurredAt))
        .limit(200);

      const breachEvents = breachRows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        type: r.type as
          | "budget_breach"
          | "token_limit_breach"
          | "price_limit_breach"
          | "budget_policy_breach",
        occurredAt: r.occurredAt,
        amountCents: r.amountCents,
        tokenUsage: r.tokenUsage != null ? Number(r.tokenUsage) : null,
        agentId: r.agentId,
        details: (r.details as Record<string, unknown>) ?? null,
        createdAt: r.createdAt,
      }));

      return {
        companyId,
        spendCents,
        budgetCents: company.budgetMonthlyCents,
        utilizationPercent: Number(utilization.toFixed(2)),
        tokenUsage,
        tokenLimit: company.tokenLimit != null ? Number(company.tokenLimit) : null,
        priceLimitCents: company.priceLimitCents ?? null,
        breachEvents,
      };
    },

    byAgent: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const costRows = await db
        .select({
          agentId: costEvents.agentId,
          agentName: agents.name,
          agentStatus: agents.status,
          costCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .leftJoin(agents, eq(costEvents.agentId, agents.id))
        .where(and(...conditions))
        .groupBy(costEvents.agentId, agents.name, agents.status)
        .orderBy(desc(sql`coalesce(sum(${costEvents.costCents}), 0)::int`));

      const runConditions: ReturnType<typeof eq>[] = [eq(heartbeatRuns.companyId, companyId)];
      if (range?.from) runConditions.push(gte(heartbeatRuns.finishedAt, range.from));
      if (range?.to) runConditions.push(lte(heartbeatRuns.finishedAt, range.to));

      const runRows = await db
        .select({
          agentId: heartbeatRuns.agentId,
          apiRunCount:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'api' then 1 else 0 end), 0)::int`,
          subscriptionRunCount:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then 1 else 0 end), 0)::int`,
          subscriptionInputTokens:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then coalesce((${heartbeatRuns.usageJson} ->> 'inputTokens')::int, 0) else 0 end), 0)::int`,
          subscriptionOutputTokens:
            sql<number>`coalesce(sum(case when coalesce((${heartbeatRuns.usageJson} ->> 'billingType'), 'unknown') = 'subscription' then coalesce((${heartbeatRuns.usageJson} ->> 'outputTokens')::int, 0) else 0 end), 0)::int`,
        })
        .from(heartbeatRuns)
        .where(and(...runConditions))
        .groupBy(heartbeatRuns.agentId);

      const runRowsByAgent = new Map(runRows.map((row) => [row.agentId, row]));
      return costRows.map((row) => {
        const runRow = runRowsByAgent.get(row.agentId);
        return {
          ...row,
          apiRunCount: runRow?.apiRunCount ?? 0,
          subscriptionRunCount: runRow?.subscriptionRunCount ?? 0,
          subscriptionInputTokens: runRow?.subscriptionInputTokens ?? 0,
          subscriptionOutputTokens: runRow?.subscriptionOutputTokens ?? 0,
        };
      });
    },

    byProject: async (companyId: string, range?: CostDateRange) => {
      const issueIdAsText = sql<string>`${issues.id}::text`;
      const runProjectLinks = db
        .selectDistinctOn([activityLog.runId, issues.projectId], {
          runId: activityLog.runId,
          projectId: issues.projectId,
        })
        .from(activityLog)
        .innerJoin(
          issues,
          and(
            eq(activityLog.entityType, "issue"),
            eq(activityLog.entityId, issueIdAsText),
          ),
        )
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(issues.companyId, companyId),
            isNotNull(activityLog.runId),
            isNotNull(issues.projectId),
          ),
        )
        .orderBy(activityLog.runId, issues.projectId, desc(activityLog.createdAt))
        .as("run_project_links");

      const conditions: ReturnType<typeof eq>[] = [eq(heartbeatRuns.companyId, companyId)];
      if (range?.from) conditions.push(gte(heartbeatRuns.finishedAt, range.from));
      if (range?.to) conditions.push(lte(heartbeatRuns.finishedAt, range.to));

      const costCentsExpr = sql<number>`coalesce(sum(round(coalesce((${heartbeatRuns.usageJson} ->> 'costUsd')::numeric, 0) * 100)), 0)::int`;

      return db
        .select({
          projectId: runProjectLinks.projectId,
          projectName: projects.name,
          costCents: costCentsExpr,
          inputTokens: sql<number>`coalesce(sum(coalesce((${heartbeatRuns.usageJson} ->> 'inputTokens')::int, 0)), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(coalesce((${heartbeatRuns.usageJson} ->> 'outputTokens')::int, 0)), 0)::int`,
        })
        .from(runProjectLinks)
        .innerJoin(heartbeatRuns, eq(runProjectLinks.runId, heartbeatRuns.id))
        .innerJoin(projects, eq(runProjectLinks.projectId, projects.id))
        .where(and(...conditions))
        .groupBy(runProjectLinks.projectId, projects.name)
        .orderBy(desc(costCentsExpr));
    },

    byBillingCode: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const sumCost = sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`;

      return db
        .select({
          billingCode: costEvents.billingCode,
          costCents: sumCost,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .where(and(...conditions))
        .groupBy(costEvents.billingCode)
        .orderBy(desc(sumCost));
    },

    byRequestDepth: async (companyId: string, range?: CostDateRange) => {
      const conditions: ReturnType<typeof eq>[] = [eq(costEvents.companyId, companyId)];
      if (range?.from) conditions.push(gte(costEvents.occurredAt, range.from));
      if (range?.to) conditions.push(lte(costEvents.occurredAt, range.to));

      const sumCost = sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`;
      const depthIsNull = sql<boolean>`(${issues.requestDepth} IS NULL)`;

      return db
        .select({
          requestDepth: issues.requestDepth,
          costCents: sumCost,
          inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
        })
        .from(costEvents)
        .leftJoin(
          issues,
          and(eq(costEvents.issueId, issues.id), eq(issues.companyId, companyId)),
        )
        .where(and(...conditions))
        .groupBy(issues.requestDepth)
        .orderBy(asc(depthIsNull), asc(issues.requestDepth));
    },
  };
}
