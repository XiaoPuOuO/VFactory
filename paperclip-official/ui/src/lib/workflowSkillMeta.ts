import { requiresWorkflowRuntime, safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";

export type CompanySkillWorkflowMeta = {
  isWorkflow: boolean;
  stepCount: number;
  triggerLabel: "manual" | "schedule" | "event" | "manual_default";
};

export function getCompanySkillWorkflowMeta(skillMarkdown: string): CompanySkillWorkflowMeta {
  const parsed = safeParseSkillFrontmatterFromMarkdown(skillMarkdown);
  if (!parsed.success) {
    return { isWorkflow: false, stepCount: 0, triggerLabel: "manual_default" };
  }
  const fm = parsed.data;
  const isWorkflow = requiresWorkflowRuntime(fm);
  const stepCount = fm.flow?.length ?? 0;
  const on = fm.trigger?.on;
  const triggerLabel: CompanySkillWorkflowMeta["triggerLabel"] =
    on === "schedule" || on === "event" || on === "manual" ? on : "manual_default";
  return { isWorkflow, stepCount, triggerLabel };
}
