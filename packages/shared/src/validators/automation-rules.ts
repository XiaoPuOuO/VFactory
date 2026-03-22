import { z } from "zod";

export const automationRuleTriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("issue_status"),
    fromStatus: z.string().min(1).nullable().optional(),
    toStatus: z.string().min(1),
  }),
  z.object({
    type: z.literal("budget_policy_breach_first"),
    policyId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    type: z.literal("agent_status"),
    fromStatus: z.string().min(1).nullable().optional(),
    toStatus: z.string().min(1),
  }),
]);

export const automationRuleActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pause_agent"),
    target: z.enum(["issue_assignee", "event_agent", "specific_agent"]),
    agentId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("add_issue_labels"),
    labelIds: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    type: z.literal("create_followup_issue"),
    title: z.string().min(1).max(500),
    projectId: z.string().uuid().nullable().optional(),
    linkParentIssue: z.boolean().optional(),
    status: z
      .enum(["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"])
      .optional(),
  }),
]);

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  trigger: automationRuleTriggerSchema,
  actions: z.array(automationRuleActionSchema).min(1).max(20),
});

export const updateAutomationRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  trigger: automationRuleTriggerSchema.optional(),
  actions: z.array(automationRuleActionSchema).min(1).max(20).optional(),
});

export type CreateAutomationRule = z.infer<typeof createAutomationRuleSchema>;
export type UpdateAutomationRule = z.infer<typeof updateAutomationRuleSchema>;
export type AutomationRuleTrigger = z.infer<typeof automationRuleTriggerSchema>;
export type AutomationRuleAction = z.infer<typeof automationRuleActionSchema>;

export const importPoliciesFromCompanySchema = z.object({
  sourceCompanyId: z.string().uuid(),
  replaceExisting: z.boolean().optional(),
});

export type ImportPoliciesFromCompany = z.infer<typeof importPoliciesFromCompanySchema>;
