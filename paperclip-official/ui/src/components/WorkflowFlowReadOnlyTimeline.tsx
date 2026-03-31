import type { SkillFlowStep } from "@paperclipai/shared";
import { useTranslation } from "react-i18next";
import "./WorkflowFlowReadOnlyTimeline.css";

function stepSummary(s: SkillFlowStep): string {
  if (s.kind === "prompt") return s.template.trim().slice(0, 72) || (s.id ?? "prompt");
  if (s.kind === "checkpoint") return s.message.trim().slice(0, 72) || s.id;
  if (s.kind === "condition") return s.condition.trim().slice(0, 72) || s.id;
  if (s.kind === "action") return `${s.action} · ${s.id}`;
  if (s.kind === "invoke_workflow") return `invoke → ${s.skill_key}`;
  return `${s.list_from} → ${s.item_as}`;
}

export function WorkflowFlowReadOnlyTimeline({ steps }: { steps: SkillFlowStep[] }) {
  const { t } = useTranslation("companySkills");
  if (steps.length === 0) return null;

  return (
    <div className="workflow-flow-readonly" aria-label={t("flowReadOnlyTitle")}>
      <div className="workflow-flow-readonly-title">{t("flowReadOnlyTitle")}</div>
      <ol className="workflow-flow-readonly-list">
        {steps.map((s, i) => (
          <li key={`${s.kind}-${i}-${"id" in s ? (s as { id?: string }).id : i}`} className="workflow-flow-readonly-item">
            <span className="workflow-flow-readonly-kind">{s.kind}</span>
            <span className="workflow-flow-readonly-text">{stepSummary(s)}</span>
            {i < steps.length - 1 && <span className="workflow-flow-readonly-arrow" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
}
