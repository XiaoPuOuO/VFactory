/**
 * 將 SKILL.md 的 frontmatter 與 body 分離，並在保留其他欄位下替換 `flow`。
 */
import yaml from "js-yaml";
import type { SkillArgumentDefinition, SkillFlowStep, SkillFrontmatter } from "@paperclipai/shared";

const FM_SPLIT = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

export type SplitSkillMarkdownResult =
  | { ok: true; record: Record<string, unknown>; body: string; rawFrontmatter: string }
  | { ok: false; error: string };

export function splitSkillMarkdown(markdown: string): SplitSkillMarkdownResult {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const m = normalized.match(FM_SPLIT);
  if (!m) {
    return { ok: false, error: "Missing YAML frontmatter (expected --- ... ---)." };
  }
  const rawFrontmatter = m[1] ?? "";
  const body = m[2] ?? "";
  try {
    const loaded = yaml.load(rawFrontmatter);
    if (loaded == null || typeof loaded !== "object" || Array.isArray(loaded)) {
      return { ok: false, error: "Frontmatter must be a YAML object." };
    }
    return { ok: true, record: { ...(loaded as Record<string, unknown>) }, body, rawFrontmatter };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 新建「作業流程」時的初始 SKILL.md：含 `mode: active`、`trigger.on: manual` 與單一 prompt 步驟，
 * 以便直接開啟流程編輯器（節點）而非僅單欄 prompt 表單。
 */
export function createInitialActiveFlowSkillMarkdown(opts: {
  name?: string;
  /** 須至少一字元以符合 frontmatter `description` 驗證 */
  description: string;
  firstStepName: string;
  firstStepTemplate: string;
}): string {
  const name = (opts.name ?? "my-skill").trim() || "my-skill";
  const description = opts.description.trim();
  const desc = description.length >= 1 ? description : " ";
  const record: Record<string, unknown> = {
    name,
    description: desc,
    mode: "active",
    trigger: { on: "manual" },
    flow: [
      {
        kind: "prompt",
        id: "step-1",
        name: opts.firstStepName.trim() || "Step 1",
        template: opts.firstStepTemplate.trim().length > 0 ? opts.firstStepTemplate : " ",
      },
    ],
  };
  const yamlText = yaml
    .dump(record, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd();
  return `---\n${yamlText}\n---\n`;
}

export function mergeFlowIntoSkillMarkdown(markdown: string, flow: SkillFlowStep[]): string {
  const split = splitSkillMarkdown(markdown);
  if (!split.ok) {
    throw new Error(split.error);
  }
  const nextRecord = { ...split.record, flow } as Record<string, unknown>;
  /** 有 flow 時單一 prompt 欄位易與步驟重複，若仍保留舊 prompt 可交給使用者；此處不主動刪除。 */
  const yamlText = yaml
    .dump(nextRecord, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd();
  const suffix = split.body.replace(/\s*$/, "");
  return `---\n${yamlText}\n---\n${suffix.length > 0 ? `${suffix}\n` : ""}`;
}

/**
 * 在保留現有 frontmatter 其餘欄位（包含 flow）的前提下，更新基本欄位。
 * 用於多步驟 flow 技能：仍需讓使用者編輯名稱/描述/模式/內部標記，而不提供 Markdown 編輯。
 */
/**
 * 在保留 flow 與其餘 frontmatter 的前提下，更新 `arguments`（與 `/skill-name` 位置參數、`{{name}}` 對應）。
 */
export function mergeArgumentsIntoSkillMarkdown(markdown: string, args: SkillArgumentDefinition[]): string {
  const split = splitSkillMarkdown(markdown);
  if (!split.ok) throw new Error(split.error);
  const nextRecord = { ...split.record } as Record<string, unknown>;
  if (args.length > 0) {
    nextRecord.arguments = args;
  } else {
    delete nextRecord.arguments;
  }
  const yamlText = yaml
    .dump(nextRecord, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd();
  const suffix = split.body.replace(/\s*$/, "");
  return `---\n${yamlText}\n---\n${suffix.length > 0 ? `${suffix}\n` : ""}`;
}

export function mergeBasicFrontmatterIntoSkillMarkdown(
  markdown: string,
  patch: {
    name?: string;
    description?: string;
    mode?: SkillFrontmatter["mode"];
    internal?: boolean;
  },
): string {
  const split = splitSkillMarkdown(markdown);
  if (!split.ok) throw new Error(split.error);
  const nextRecord = { ...split.record } as Record<string, unknown>;

  if (patch.name !== undefined) nextRecord.name = patch.name;
  if (patch.description !== undefined) nextRecord.description = patch.description;
  if (patch.mode !== undefined) nextRecord.mode = patch.mode;

  if (patch.internal !== undefined) {
    const md = nextRecord.metadata;
    const metadata = md && typeof md === "object" && !Array.isArray(md) ? { ...(md as Record<string, unknown>) } : {};
    if (patch.internal) {
      metadata.internal = true;
      nextRecord.metadata = metadata;
    } else {
      delete metadata.internal;
      if (Object.keys(metadata).length === 0) {
        delete nextRecord.metadata;
      } else {
        nextRecord.metadata = metadata;
      }
    }
  }

  const yamlText = yaml
    .dump(nextRecord, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd();
  const suffix = split.body.replace(/\s*$/, "");
  return `---\n${yamlText}\n---\n${suffix.length > 0 ? `${suffix}\n` : ""}`;
}

export function getFlowFromFrontmatter(data: SkillFrontmatter): SkillFlowStep[] {
  const f = data.flow;
  return Array.isArray(f) ? f : [];
}

/**
 * 將僅含頂層 `prompt` 的技能 Markdown 轉成含單一 `flow` prompt 步驟（用於「簡單 → 多步驟」）。
 * 會移除頂層 `prompt`，避免與 `flow` 重複。
 */
export function promotePromptToFlowMarkdown(markdown: string, stepId = "step-1"): string {
  const split = splitSkillMarkdown(markdown);
  if (!split.ok) {
    throw new Error(split.error);
  }
  const prompt = typeof split.record.prompt === "string" ? split.record.prompt : "";
  const record = { ...split.record } as Record<string, unknown>;
  delete record.prompt;
  const flow: SkillFlowStep[] = [
    {
      kind: "prompt",
      id: stepId,
      template: prompt.length > 0 ? prompt : " ",
    },
  ];
  record.flow = flow;
  const yamlText = yaml
    .dump(record, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    })
    .trimEnd();
  const suffix = split.body.replace(/\s*$/, "");
  return `---\n${yamlText}\n---\n${suffix.length > 0 ? `${suffix}\n` : ""}`;
}
