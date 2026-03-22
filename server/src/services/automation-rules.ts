import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companyAutomationRuleFires,
  companyAutomationRules,
  issueLabels,
  issues,
  labels,
} from "@paperclipai/db";
import type {
  AutomationRuleAction,
  AutomationRuleTrigger,
  CreateAutomationRule,
  UpdateAutomationRule,
} from "@paperclipai/shared";
import {
  automationRuleActionSchema,
  automationRuleTriggerSchema,
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
} from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";

function parseTrigger(raw: unknown): AutomationRuleTrigger {
  const parsed = automationRuleTriggerSchema.safeParse(raw);
  if (!parsed.success) throw unprocessable(parsed.error.message);
  return parsed.data;
}

function parseActions(raw: unknown): AutomationRuleAction[] {
  const parsed = z.array(automationRuleActionSchema).min(1).safeParse(raw);
  if (!parsed.success) throw unprocessable(parsed.error.message);
  return parsed.data;
}

function matchIssueTrigger(
  trigger: AutomationRuleTrigger,
  fromStatus: string,
  toStatus: string,
): boolean {
  if (trigger.type !== "issue_status") return false;
  if (trigger.toStatus !== toStatus) return false;
  if (trigger.fromStatus != null && trigger.fromStatus !== fromStatus) return false;
  return true;
}

function matchBudgetTrigger(trigger: AutomationRuleTrigger, policyId: string): boolean {
  if (trigger.type !== "budget_policy_breach_first") return false;
  if (trigger.policyId != null && trigger.policyId !== policyId) return false;
  return true;
}

function matchAgentTrigger(
  trigger: AutomationRuleTrigger,
  fromStatus: string,
  toStatus: string,
): boolean {
  if (trigger.type !== "agent_status") return false;
  if (trigger.toStatus !== toStatus) return false;
  if (trigger.fromStatus != null && trigger.fromStatus !== fromStatus) return false;
  return true;
}

async function tryInsertDedupe(
  db: Db,
  ruleId: string,
  companyId: string,
  dedupeKey: string,
): Promise<boolean> {
  try {
    await db.insert(companyAutomationRuleFires).values({
      ruleId,
      companyId,
      dedupeKey,
    });
    return true;
  } catch {
    return false;
  }
}

function renderTitleTemplate(template: string, ctx: { issue?: { identifier: string; title: string } }) {
  let out = template;
  if (ctx.issue) {
    out = out.replace(/\{\{issue\.identifier\}\}/g, ctx.issue.identifier);
    out = out.replace(/\{\{issue\.title\}\}/g, ctx.issue.title);
  }
  return out;
}

export function automationRuleService(db: Db) {
  return {
    list: async (companyId: string) => {
      return db
        .select()
        .from(companyAutomationRules)
        .where(eq(companyAutomationRules.companyId, companyId))
        .orderBy(asc(companyAutomationRules.sortOrder), asc(companyAutomationRules.createdAt));
    },

    getById: async (companyId: string, id: string) => {
      return db
        .select()
        .from(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.id, id)))
        .then((rows) => rows[0] ?? null);
    },

    create: async (companyId: string, input: CreateAutomationRule) => {
      const parsed = createAutomationRuleSchema.parse(input);
      const now = new Date();
      const [row] = await db
        .insert(companyAutomationRules)
        .values({
          companyId,
          name: parsed.name,
          enabled: parsed.enabled ?? true,
          sortOrder: parsed.sortOrder ?? 0,
          trigger: parsed.trigger as Record<string, unknown>,
          actions: parsed.actions as unknown[],
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return row!;
    },

    update: async (companyId: string, id: string, input: UpdateAutomationRule) => {
      const parsed = updateAutomationRuleSchema.parse(input);
      const existing = await db
        .select()
        .from(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.id, id)))
        .then((rows) => rows[0] ?? null);
      if (!existing) return null;

      const nextTrigger =
        parsed.trigger != null ? (parsed.trigger as Record<string, unknown>) : existing.trigger;
      const nextActions = parsed.actions != null ? (parsed.actions as unknown[]) : existing.actions;

      if (parsed.trigger != null) parseTrigger(nextTrigger);
      if (parsed.actions != null) parseActions(nextActions);

      const now = new Date();
      const [row] = await db
        .update(companyAutomationRules)
        .set({
          ...(parsed.name != null ? { name: parsed.name } : {}),
          ...(parsed.enabled != null ? { enabled: parsed.enabled } : {}),
          ...(parsed.sortOrder != null ? { sortOrder: parsed.sortOrder } : {}),
          ...(parsed.trigger != null ? { trigger: nextTrigger } : {}),
          ...(parsed.actions != null ? { actions: nextActions } : {}),
          updatedAt: now,
        })
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.id, id)))
        .returning();
      return row ?? null;
    },

    delete: async (companyId: string, id: string) => {
      const rows = await db
        .delete(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.id, id)))
        .returning({ id: companyAutomationRules.id });
      return rows[0] != null;
    },

    evaluateIssueTransition: async (params: {
      companyId: string;
      issueId: string;
      fromStatus: string;
      toStatus: string;
    }) => {
      const { companyId, issueId, fromStatus, toStatus } = params;
      const rules = await db
        .select()
        .from(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.enabled, true)))
        .orderBy(asc(companyAutomationRules.sortOrder));

      const issueRow = await db
        .select()
        .from(issues)
        .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!issueRow) return;

      for (const rule of rules) {
        const trigger = parseTrigger(rule.trigger);
        if (!matchIssueTrigger(trigger, fromStatus, toStatus)) continue;

        const dedupeKey = `issue:${issueId}:${fromStatus}->${toStatus}`;
        const inserted = await tryInsertDedupe(db, rule.id, companyId, dedupeKey);
        if (!inserted) continue;

        await executeRuleActions(db, {
          companyId,
          ruleId: rule.id,
          ruleName: rule.name,
          actions: parseActions(rule.actions),
          issueContext: {
            issue: issueRow,
          },
        });
      }
    },

    evaluateBudgetPolicyBreach: async (params: {
      companyId: string;
      policyId: string;
      breachEventId: string;
      agentId: string | null;
    }) => {
      const { companyId, policyId, breachEventId, agentId } = params;
      const rules = await db
        .select()
        .from(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.enabled, true)))
        .orderBy(asc(companyAutomationRules.sortOrder));

      for (const rule of rules) {
        const trigger = parseTrigger(rule.trigger);
        if (!matchBudgetTrigger(trigger, policyId)) continue;

        const dedupeKey = `budget:${breachEventId}`;
        const inserted = await tryInsertDedupe(db, rule.id, companyId, dedupeKey);
        if (!inserted) continue;

        await executeRuleActions(db, {
          companyId,
          ruleId: rule.id,
          ruleName: rule.name,
          actions: parseActions(rule.actions),
          budgetContext: { policyId, agentId },
        });
      }
    },

    evaluateAgentStatusChange: async (params: {
      companyId: string;
      agentId: string;
      fromStatus: string;
      toStatus: string;
    }) => {
      const { companyId, agentId, fromStatus, toStatus } = params;
      const rules = await db
        .select()
        .from(companyAutomationRules)
        .where(and(eq(companyAutomationRules.companyId, companyId), eq(companyAutomationRules.enabled, true)))
        .orderBy(asc(companyAutomationRules.sortOrder));

      const agentRow = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!agentRow) return;

      for (const rule of rules) {
        const trigger = parseTrigger(rule.trigger);
        if (!matchAgentTrigger(trigger, fromStatus, toStatus)) continue;

        const dedupeKey = `agent:${agentId}:${fromStatus}->${toStatus}`;
        const inserted = await tryInsertDedupe(db, rule.id, companyId, dedupeKey);
        if (!inserted) continue;

        await executeRuleActions(db, {
          companyId,
          ruleId: rule.id,
          ruleName: rule.name,
          actions: parseActions(rule.actions),
          agentContext: { agent: agentRow },
        });
      }
    },
  };
}

type ExecuteCtx = {
  companyId: string;
  ruleId: string;
  ruleName: string;
  actions: AutomationRuleAction[];
  issueContext?: { issue: typeof issues.$inferSelect };
  budgetContext?: { policyId: string; agentId: string | null };
  agentContext?: { agent: typeof agents.$inferSelect };
};

async function executeRuleActions(db: Db, ctx: ExecuteCtx) {
  const { companyId, ruleId, ruleName, actions } = ctx;
  const executed: string[] = [];

  for (const action of actions) {
    try {
      if (action.type === "pause_agent") {
        let targetAgentId: string | null = null;
        if (action.target === "issue_assignee") {
          const aid = ctx.issueContext?.issue.assigneeAgentId ?? null;
          targetAgentId = aid;
        } else if (action.target === "event_agent") {
          targetAgentId = ctx.budgetContext?.agentId ?? ctx.agentContext?.agent.id ?? null;
        } else if (action.target === "specific_agent") {
          targetAgentId = action.agentId ?? null;
        }
        if (!targetAgentId) {
          executed.push("pause_agent:skipped_no_target");
          continue;
        }
        const row = await db
          .select()
          .from(agents)
          .where(and(eq(agents.id, targetAgentId), eq(agents.companyId, companyId)))
          .then((rows) => rows[0] ?? null);
        if (!row || row.status === "terminated" || row.status === "paused") {
          executed.push("pause_agent:skipped_invalid_state");
          continue;
        }
        await db
          .update(agents)
          .set({ status: "paused", autoPauseReason: "automation_rule", updatedAt: new Date() })
          .where(eq(agents.id, targetAgentId));
        executed.push(`pause_agent:${targetAgentId}`);
      } else if (action.type === "add_issue_labels") {
        if (!ctx.issueContext) {
          executed.push("add_issue_labels:skipped_no_issue");
          continue;
        }
        const issueId = ctx.issueContext.issue.id;
        for (const labelId of action.labelIds) {
          const [lab] = await db
            .select({ id: labels.id })
            .from(labels)
            .where(and(eq(labels.id, labelId), eq(labels.companyId, companyId)))
            .limit(1);
          if (!lab) continue;
          await db
            .insert(issueLabels)
            .values({ issueId, labelId, companyId })
            .onConflictDoNothing({ target: [issueLabels.issueId, issueLabels.labelId] });
        }
        executed.push("add_issue_labels");
      } else if (action.type === "create_followup_issue") {
        if (!ctx.issueContext) {
          executed.push("create_followup_issue:skipped_no_issue");
          continue;
        }
        const issue = ctx.issueContext.issue;
        const title = renderTitleTemplate(action.title, {
          issue: { identifier: issue.identifier ?? "", title: issue.title ?? "" },
        });
        const projectId = action.projectId ?? issue.projectId;
        const parentId = action.linkParentIssue !== false ? issue.id : undefined;
        const { issueService } = await import("./issues.js");
        await issueService(db).create(
          companyId,
          {
            title,
            status: action.status ?? "backlog",
            projectId: projectId ?? undefined,
            parentId,
          },
          { suppressAutomationRules: true },
        );
        executed.push("create_followup_issue");
      }
    } catch (err) {
      executed.push(
        `error:${action.type}:${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await logActivity(db, {
    companyId,
    actorType: "system",
    actorId: `automation_rule:${ruleId}`,
    action: "automation_rule.executed",
    entityType: "automation_rule",
    entityId: ruleId,
    details: {
      ruleName,
      actions: executed,
    },
  });
}
