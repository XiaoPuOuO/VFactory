/**
 * 公司層技能編輯器：表單狀態 ↔ 合法 SKILL.md（與 @paperclipai/shared 驗證一致）
 */
import yaml from "js-yaml";
import type { SkillArgumentDefinition, SkillFrontmatter, SkillMode } from "@paperclipai/shared";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";

export type CompanySkillArgumentFormRow = {
  id: string;
  name: string;
  /** 人類可讀標題（對應 YAML `label`）；變數名仍為 `name`（`{{name}}`） */
  label: string;
  type: SkillArgumentDefinition["type"];
  required: boolean;
  description: string;
  /** 各型別預設值以字串編輯；enum 的選項以逗號分隔 */
  defaultValue: string;
  enumOptions: string;
};

export type CompanySkillFormState = {
  name: string;
  description: string;
  mode: SkillMode;
  /** `metadata.internal`：預設自工作流程列表隱藏，且不參與被動注入；主動觸發仍可用。 */
  internal: boolean;
  prompt: string;
  /** 第二個 --- 之後的 Markdown（參考說明、範例等） */
  markdownBody: string;
  arguments: CompanySkillArgumentFormRow[];
};

const BODY_SPLIT = /^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/;

export function extractMarkdownBodyAfterFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const m = normalized.match(BODY_SPLIT);
  if (!m) return "";
  return (m[1] ?? "").replace(/\s*$/, "");
}

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `arg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultCompanySkillForm(): CompanySkillFormState {
  return {
    name: "my-skill",
    description: "",
    mode: "passive",
    internal: false,
    prompt: "Company={{companyId}} Agent={{agentId}} Skill={{skillName}}",
    markdownBody: "",
    arguments: [],
  };
}

export function createEmptyArgumentRow(): CompanySkillArgumentFormRow {
  return {
    id: newRowId(),
    name: "",
    label: "",
    type: "string",
    required: false,
    description: "",
    defaultValue: "",
    enumOptions: "",
  };
}

/** 從已解析的 YAML `arguments` 還原為表單列（流程編輯器／進階模式用）。 */
export function skillArgumentDefinitionsToFormRows(defs: SkillArgumentDefinition[] | undefined): CompanySkillArgumentFormRow[] {
  if (!defs?.length) return [];
  return defs.map(argumentToRow);
}

/** 表單列 → 寫入 SKILL.md 的 arguments（略過空白 name）。 */
export function companySkillArgumentRowsToDefinitions(rows: CompanySkillArgumentFormRow[]): SkillArgumentDefinition[] {
  return rows.filter((row) => row.name.trim().length > 0).map(rowToArgument);
}

function argumentToRow(def: SkillArgumentDefinition): CompanySkillArgumentFormRow {
  const base = {
    id: newRowId(),
    name: def.name,
    label: def.label ?? "",
    type: def.type,
    required: def.required === true,
    description: def.description ?? "",
  };
  switch (def.type) {
    case "string":
      return { ...base, defaultValue: def.default ?? "", enumOptions: "" };
    case "number":
      return { ...base, defaultValue: def.default != null ? String(def.default) : "", enumOptions: "" };
    case "boolean":
      return { ...base, defaultValue: def.default != null ? String(def.default) : "", enumOptions: "" };
    case "enum":
      return {
        ...base,
        defaultValue: def.default ?? "",
        enumOptions: def.enum.join(", "),
      };
    case "json":
      return {
        ...base,
        defaultValue: def.default !== undefined ? JSON.stringify(def.default, null, 0) : "",
        enumOptions: "",
      };
  }
}

function parseDefaultBoolean(raw: string): boolean | undefined {
  const t = raw.trim().toLowerCase();
  if (t.length === 0) return undefined;
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no") return false;
  throw new Error("boolean default must be true/false");
}

function rowToArgument(row: CompanySkillArgumentFormRow): SkillArgumentDefinition {
  const name = row.name.trim();
  if (name.length === 0) {
    throw new Error("Argument name is required");
  }
  const desc = row.description.trim();
  const label = row.label.trim();
  const base = {
    name,
    ...(label.length > 0 ? { label } : {}),
    ...(desc.length > 0 ? { description: desc } : {}),
    ...(row.required ? { required: true as const } : {}),
  };

  switch (row.type) {
    case "string": {
      const d = row.defaultValue.trim();
      return { ...base, type: "string", ...(d.length > 0 ? { default: d } : {}) };
    }
    case "number": {
      const d = row.defaultValue.trim();
      if (d.length === 0) return { ...base, type: "number" };
      const n = Number(d);
      if (!Number.isFinite(n)) throw new Error(`Invalid number default for "${name}"`);
      return { ...base, type: "number", default: n };
    }
    case "boolean": {
      const d = row.defaultValue.trim();
      if (d.length === 0) return { ...base, type: "boolean" };
      return { ...base, type: "boolean", default: parseDefaultBoolean(d) };
    }
    case "enum": {
      const parts = row.enumOptions
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length === 0) {
        throw new Error(`Enum "${name}" needs at least one option`);
      }
      const def = row.defaultValue.trim();
      const out: SkillArgumentDefinition = {
        ...base,
        type: "enum",
        enum: parts,
        ...(def.length > 0 ? { default: def } : {}),
      };
      return out;
    }
    case "json": {
      const d = row.defaultValue.trim();
      if (d.length === 0) return { ...base, type: "json" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(d);
      } catch {
        throw new Error(`Invalid JSON default for "${name}"`);
      }
      return { ...base, type: "json", default: parsed };
    }
    default: {
      const _x: never = row.type;
      return _x;
    }
  }
}

export type ParseCompanySkillFormResult =
  | { mode: "form"; form: CompanySkillFormState }
  | { mode: "advanced"; rawMarkdown: string; hint?: string };

/**
 * 若技能使用 `flow`（多步驟）或 frontmatter 無法通過驗證，改以「流程編輯器」模式。
 * 注意：流程編輯器模式下仍可透過 UI 編輯基本欄位（名稱/描述/模式/內部），不依賴 Markdown 編輯。
 */
export function parseCompanySkillMarkdownToFormOrAdvanced(markdown: string): ParseCompanySkillFormResult {
  const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
  if (!parsed.success) {
    return {
      mode: "advanced",
      rawMarkdown: markdown,
      hint: "invalidFrontmatter",
    };
  }
  const data = parsed.data as SkillFrontmatter;
  const hasFlow = Array.isArray(data.flow) && data.flow.length > 0;
  if (hasFlow) {
    return {
      mode: "advanced",
      rawMarkdown: markdown,
      hint: "flowUsesFlowEditor",
    };
  }

  const prompt =
    typeof data.prompt === "string" && data.prompt.trim().length > 0 ? data.prompt : "";
  if (prompt.length === 0) {
    return { mode: "advanced", rawMarkdown: markdown, hint: "missingPrompt" };
  }

  const body = extractMarkdownBodyAfterFrontmatter(markdown);

  return {
    mode: "form",
    form: {
      name: data.name,
      description: data.description,
      mode: data.mode,
      internal: data.metadata?.internal === true,
      prompt,
      markdownBody: body,
      arguments: (data.arguments ?? []).map(argumentToRow),
    },
  };
}

export function buildCompanySkillMarkdownFromForm(form: CompanySkillFormState): string {
  const args = form.arguments
    .filter((row) => row.name.trim().length > 0)
    .map(rowToArgument);
  const fm: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim(),
    mode: form.mode,
  };
  if (form.internal) {
    fm.metadata = { internal: true };
  }
  if (args.length > 0) {
    fm.arguments = args;
  }
  fm.prompt = form.prompt;

  const yamlText = yaml.dump(fm, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();

  const body = form.markdownBody.replace(/\r\n/g, "\n");
  const trimmedBody = body.trimEnd();
  const suffix = trimmedBody.length > 0 ? `${trimmedBody}\n` : "";
  return `---\n${yamlText}\n---\n${suffix}`;
}

function formatSkillParseError(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
    const issues = (err as { issues: { message?: string }[] }).issues;
    return issues.map((i) => i.message ?? "").filter(Boolean).join("；");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function validateSkillMarkdown(markdown: string): { ok: true } | { ok: false; message: string } {
  const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
  if (parsed.success) {
    return { ok: true };
  }
  return { ok: false, message: formatSkillParseError(parsed.error) };
}
