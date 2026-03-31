import type { SkillFlowStep } from "@paperclipai/shared";

/**
 * 流程編輯器「新增步驟」子選單順序與種類 — 與 `SkillFlowStep["kind"]` union、側欄種類 Select 一致（單一真相）。
 * 預設「AI 執行」對應 {@link SkillFlowStep} 中 `kind: "prompt"`（見 `addStepOfKind` prompt 分支）。
 */
export const WORKFLOW_FLOW_EDITOR_STEP_KINDS: readonly {
  kind: SkillFlowStep["kind"];
  titleKey: string;
  descKey: string;
}[] = [
  { kind: "prompt", titleKey: "stepType_prompt", descKey: "stepType_promptDesc" },
  { kind: "checkpoint", titleKey: "stepType_checkpoint", descKey: "stepType_checkpointDesc" },
  { kind: "condition", titleKey: "stepType_condition", descKey: "stepType_conditionDesc" },
  { kind: "action", titleKey: "stepType_action", descKey: "stepType_actionDesc" },
  { kind: "loop", titleKey: "stepType_loop", descKey: "stepType_loopDesc" },
  { kind: "invoke_workflow", titleKey: "stepType_invokeWorkflow", descKey: "stepType_invokeWorkflowDesc" },
] as const;
