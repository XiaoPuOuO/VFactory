import type { SkillFrontmatter } from "./types/skill.js";

/**
 * 內建於 workflow context 的鍵，可在 `{{...}}` 中使用（見 workflow-run-service startRun context）。
 */
export const WORKFLOW_TEMPLATE_BUILTIN_KEYS = ["companyId", "agentId", "skillName"] as const;

const PLACEHOLDER_RE = /{{\s*([A-Za-z0-9_-]+)\s*}}/g;

/**
 * 從字串中擷取所有 `{{var}}` 的變數名（與 workflow-template / skill-injection 正則一致）。
 */
export function extractWorkflowTemplatePlaceholders(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

/**
 * 單一真相來源：可合法出現在 `{{...}}` 的鍵 =
 * - 內建：companyId、agentId、skillName
 * - `arguments[].name`（模板變數名，與 `/skill arg1` 位置參數對應）
 * - 流程步驟寫入 context 的 `output`（prompt / invoke_workflow）
 * - `loop.item_as`（迴圈本體模板用）
 */
export function collectRegisteredTemplateKeysFromFrontmatter(fm: SkillFrontmatter): Set<string> {
  const s = new Set<string>(WORKFLOW_TEMPLATE_BUILTIN_KEYS);
  for (const a of fm.arguments ?? []) {
    s.add(a.name);
  }
  for (const step of fm.flow ?? []) {
    if (step.kind === "prompt" && step.output) s.add(step.output);
    if (step.kind === "invoke_workflow" && step.output) s.add(step.output);
    if (step.kind === "loop") s.add(step.item_as);
  }
  return s;
}

function collectAllTemplateStringsFromFrontmatter(fm: SkillFrontmatter): string[] {
  const parts: string[] = [];
  if (typeof fm.prompt === "string") parts.push(fm.prompt);
  for (const step of fm.flow ?? []) {
    if (step.kind === "prompt") parts.push(step.template);
    if (step.kind === "checkpoint") parts.push(step.message);
    if (step.kind === "condition") parts.push(step.condition);
    if (step.kind === "action") {
      for (const v of Object.values(step.params)) parts.push(v);
    }
    if (step.kind === "invoke_workflow") {
      for (const a of step.args ?? []) parts.push(a);
    }
  }
  return parts;
}

export type WorkflowTemplatePlaceholderValidation =
  | { ok: true }
  | { ok: false; unknownPlaceholders: string[] };

/**
 * 驗證 frontmatter 內所有會經 `renderWorkflowTemplate` 渲染的字串中，
 * 每個 `{{name}}` 的 `name` 皆已註冊（見 {@link collectRegisteredTemplateKeysFromFrontmatter}）。
 */
export function validateWorkflowFrontmatterTemplatePlaceholders(fm: SkillFrontmatter): WorkflowTemplatePlaceholderValidation {
  const registered = collectRegisteredTemplateKeysFromFrontmatter(fm);
  const unknown = new Set<string>();
  for (const text of collectAllTemplateStringsFromFrontmatter(fm)) {
    for (const ph of extractWorkflowTemplatePlaceholders(text)) {
      if (!registered.has(ph)) unknown.add(ph);
    }
  }
  if (unknown.size === 0) return { ok: true };
  return { ok: false, unknownPlaceholders: [...unknown].sort() };
}
