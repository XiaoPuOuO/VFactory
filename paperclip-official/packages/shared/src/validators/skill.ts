import yaml, { JSON_SCHEMA } from "js-yaml";
import { z } from "zod";
import type { SkillArgumentDefinition, SkillFlowStep, SkillFrontmatter, SkillMode } from "../types/skill.js";
import { validateWorkflowFrontmatterTemplatePlaceholders } from "../workflow-template-validation.js";

const skillNameSchema = z
  .string()
  .min(1, "skill name is required")
  .max(64, "skill name max length is 64")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "skill name must be kebab-case (lowercase with hyphens)");

const skillModeSchema = z.enum(["active", "passive"]);

const skillMetadataSchema = z
  .object({
    internal: z.boolean().optional(),
    passiveWakeHints: z.array(z.string().min(1).max(128)).max(48).optional(),
  })
  .strict()
  .optional();

const skillArgumentBaseSchema = z
  .object({
    name: z
      .string()
      .min(1, "argument name is required")
      .max(64, "argument name max length is 64")
      .regex(/^[A-Za-z0-9_-]+$/, "argument name must be alphanumeric/_/-"),
    label: z.string().min(1).max(256).optional(),
    description: z.string().min(1).optional(),
    required: z.boolean().optional(),
  })
  .strict();

const skillArgumentStringSchema = skillArgumentBaseSchema
  .extend({
    type: z.literal("string"),
    default: z.string().optional(),
  })
  .strict();

const skillArgumentNumberSchema = skillArgumentBaseSchema
  .extend({
    type: z.literal("number"),
    default: z.number().finite().optional(),
  })
  .strict();

const skillArgumentBooleanSchema = skillArgumentBaseSchema
  .extend({
    type: z.literal("boolean"),
    default: z.boolean().optional(),
  })
  .strict();

const skillArgumentEnumSchema = skillArgumentBaseSchema
  .extend({
    type: z.literal("enum"),
    enum: z.array(z.string().min(1)).min(1, "enum must have at least one value"),
    default: z.string().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.default != null && !data.enum.includes(data.default)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "default must be one of enum values",
        path: ["default"],
      });
    }
  });

const skillArgumentJsonSchema = skillArgumentBaseSchema
  .extend({
    type: z.literal("json"),
    default: z.unknown().optional(),
  })
  .strict();

export const skillArgumentDefinitionSchema = z.union([
  skillArgumentStringSchema,
  skillArgumentNumberSchema,
  skillArgumentBooleanSchema,
  skillArgumentEnumSchema,
  skillArgumentJsonSchema,
]) as z.ZodType<SkillArgumentDefinition>;

const stepIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "step id must be alphanumeric/_/-");

const contextOutputKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "output key must be alphanumeric/_/-");

const dependsOnSchema = z.array(stepIdSchema).optional();

const requireApprovalBeforeSchema = z.boolean().optional();

const skillFlowPromptStepSchema = z
  .object({
    kind: z.literal("prompt"),
    id: stepIdSchema.optional(),
    name: z.string().min(1).max(256).optional(),
    template: z.string().min(1),
    output: contextOutputKeySchema.optional(),
    require_human_input: z.boolean().optional(),
    require_approval_before: requireApprovalBeforeSchema,
    dangerous: z.boolean().optional(),
    depends_on: dependsOnSchema,
  })
  .strict();

const skillFlowCheckpointStepSchema = z
  .object({
    kind: z.literal("checkpoint"),
    id: stepIdSchema,
    name: z.string().min(1).max(256).optional(),
    message: z.string().min(1).max(16_000),
    on_approve: stepIdSchema,
    on_reject: stepIdSchema,
    require_human_confirm: z.boolean().optional(),
    timeout_hours: z.number().finite().positive().max(8760).optional(),
    require_approval_before: requireApprovalBeforeSchema,
    depends_on: dependsOnSchema,
  })
  .strict();

const skillFlowConditionStepSchema = z
  .object({
    kind: z.literal("condition"),
    id: stepIdSchema,
    name: z.string().min(1).max(256).optional(),
    condition: z.string().min(1).max(2048),
    if_true: stepIdSchema,
    if_false: stepIdSchema,
    require_approval_before: requireApprovalBeforeSchema,
    depends_on: dependsOnSchema,
  })
  .strict();

const workflowBuiltinActionSchema = z.enum(["create_issue"]);

const skillFlowActionStepSchema = z
  .object({
    kind: z.literal("action"),
    id: stepIdSchema,
    name: z.string().min(1).max(256).optional(),
    action: workflowBuiltinActionSchema,
    params: z.record(z.string(), z.string()).default({}),
    require_approval_before: requireApprovalBeforeSchema,
    dangerous: z.boolean().optional(),
    depends_on: dependsOnSchema,
  })
  .strict();

const skillFlowLoopStepSchema = z
  .object({
    kind: z.literal("loop"),
    id: stepIdSchema,
    name: z.string().min(1).max(256).optional(),
    list_from: z.string().min(1).max(128),
    item_as: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    body: z.array(stepIdSchema).min(1).max(32),
    require_approval_before: requireApprovalBeforeSchema,
    depends_on: dependsOnSchema,
  })
  .strict();

const skillFlowInvokeWorkflowStepSchema = z
  .object({
    kind: z.literal("invoke_workflow"),
    id: stepIdSchema,
    name: z.string().min(1).max(256).optional(),
    skill_key: skillNameSchema,
    args: z.array(z.string().max(16_000)).max(32).optional(),
    output: contextOutputKeySchema.optional(),
    require_approval_before: requireApprovalBeforeSchema,
    dangerous: z.boolean().optional(),
    depends_on: dependsOnSchema,
  })
  .strict();

export const skillFlowStepSchema = z.discriminatedUnion("kind", [
  skillFlowPromptStepSchema,
  skillFlowCheckpointStepSchema,
  skillFlowConditionStepSchema,
  skillFlowActionStepSchema,
  skillFlowLoopStepSchema,
  skillFlowInvokeWorkflowStepSchema,
]) as z.ZodType<SkillFlowStep>;

const workflowTriggerSchema = z
  .object({
    on: z.enum(["manual", "schedule", "event"]),
  })
  .strict()
  .optional();

function getStepId(step: SkillFlowStep): string | undefined {
  return "id" in step && typeof step.id === "string" ? step.id : undefined;
}

function collectFlowReferences(step: SkillFlowStep): string[] {
  const refs: string[] = [];
  if (step.depends_on) refs.push(...step.depends_on);
  if (step.kind === "checkpoint") {
    refs.push(step.on_approve, step.on_reject);
  }
  if (step.kind === "condition") {
    refs.push(step.if_true, step.if_false);
  }
  if (step.kind === "loop") {
    refs.push(...step.body);
  }
  return refs;
}

function flowHasCycle(steps: SkillFlowStep[]): boolean {
  const idSet = new Set<string>();
  for (const s of steps) {
    const id = getStepId(s);
    if (id) idSet.add(id);
  }
  const adj = new Map<string, string[]>();
  for (const id of idSet) adj.set(id, []);
  for (const s of steps) {
    const sid = getStepId(s);
    if (!sid) continue;
    for (const d of s.depends_on ?? []) {
      if (!idSet.has(d)) continue;
      const list = adj.get(d);
      if (list) list.push(sid);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(u: string): boolean {
    if (visiting.has(u)) return true;
    if (visited.has(u)) return false;
    visiting.add(u);
    for (const v of adj.get(u) ?? []) {
      if (dfs(v)) return true;
    }
    visiting.delete(u);
    visited.add(u);
    return false;
  }
  for (const id of idSet) {
    if (dfs(id)) return true;
  }
  return false;
}

type BuildSkillFrontmatterOptions = {
  /**
   * 流程編輯器即時同步：放寬 name／description／prompt 等欄位，並略過儲存級 superRefine，
   * 避免輸入途中因暫時空白或結構未完成而無法解析、導致 UI 清空。儲存仍須走嚴格 {@link skillFrontmatterSchema}。
   */
  forFlowEditorDraft?: boolean;
};

function buildSkillFrontmatterSchema(
  nameSchema: z.ZodType<string, z.ZodTypeDef, unknown>,
  options?: BuildSkillFrontmatterOptions,
) {
  const draft = options?.forFlowEditorDraft === true;

  const descriptionSchema = draft
    ? z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().max(1024))
    : z.string().min(1).max(1024);

  /** 嚴格：有 prompt 則至少 1 字。草稿：允許空字串，僅限長度。 */
  const promptSchema = draft
    ? z.string().max(256_000).optional()
    : z.string().min(1).optional();

  const base = z
    .object({
      name: nameSchema,
      description: descriptionSchema,
      mode: skillModeSchema,
      metadata: skillMetadataSchema,
      arguments: z.array(skillArgumentDefinitionSchema).optional().default([]),
      prompt: promptSchema,
      flow: z.array(skillFlowStepSchema).optional(),
      trigger: workflowTriggerSchema,
    })
    .strict();

  const withSaveRefines = draft
    ? base
    : base
        .superRefine((data, ctx) => {
          const hasPrompt = typeof data.prompt === "string" && data.prompt.trim().length > 0;
          const hasFlow = Array.isArray(data.flow) && data.flow.length > 0;
          if (!hasPrompt && !hasFlow) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Either `prompt` or non-empty `flow` is required",
              path: ["prompt"],
            });
          }
        })
        .superRefine((data, ctx) => {
          const flow = data.flow;
          if (!flow || flow.length === 0) return;

          const needsExplicitIds = flow.length > 1 || flow.some((s) => s.kind !== "prompt");
          for (let i = 0; i < flow.length; i++) {
            const step = flow[i]!;
            const id = getStepId(step);
            if (needsExplicitIds && (id == null || id.length === 0)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Each flow step must have `id` when there are multiple steps or any non-prompt step",
                path: ["flow", i, "id"],
              });
            }
          }

          const idSet = new Set<string>();
          for (const s of flow) {
            const id = getStepId(s);
            if (!id) continue;
            if (idSet.has(id)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Duplicate flow step id: ${id}`,
                path: ["flow"],
              });
              return;
            }
            idSet.add(id);
          }

          for (let i = 0; i < flow.length; i++) {
            const step = flow[i]!;
            for (const ref of collectFlowReferences(step)) {
              if (!idSet.has(ref)) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: `Unknown flow step reference: ${ref}`,
                  path: ["flow", i],
                });
              }
            }
          }

          if (flowHasCycle(flow)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Flow dependency graph must be acyclic",
              path: ["flow"],
            });
          }
        })
        .superRefine((data, ctx) => {
          const ph = validateWorkflowFrontmatterTemplatePlaceholders(data as SkillFrontmatter);
          if (ph.ok) return;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `未定義的模板佔位符：${ph.unknownPlaceholders.join(", ")}（須為 arguments.name、步驟 output，或內建 companyId/agentId/skillName）`,
            path: ["flow"],
          });
        });

  return withSaveRefines.transform((data): SkillFrontmatter => {
    const flow = data.flow;
    if (flow?.length === 1 && flow[0]!.kind === "prompt" && getStepId(flow[0]!) == null) {
      const only = flow[0] as SkillFlowStep & { kind: "prompt" };
      return {
        ...data,
        flow: [{ ...only, id: "default-prompt" }],
      } as SkillFrontmatter;
    }
    return data as SkillFrontmatter;
  });
}

/** 儲存／匯入／執行：技能名稱須為 kebab-case。 */
export const skillFrontmatterSchema = buildSkillFrontmatterSchema(skillNameSchema);

/**
 * 流程編輯器即時同步用：名稱／說明等可暫時空白，且不跑儲存級 flow／prompt 規則，避免輸入途中整個圖被清空。
 * 儲存前仍須以 {@link skillFrontmatterSchema} / {@link safeParseSkillFrontmatterFromMarkdown} 驗證。
 */
const skillNameSchemaForFlowEditor = z.preprocess(
  (val) => (typeof val === "string" ? val : ""),
  z.string().max(64, "skill name max length is 64"),
);

export const skillFrontmatterSchemaForFlowEditor = buildSkillFrontmatterSchema(skillNameSchemaForFlowEditor, {
  forFlowEditorDraft: true,
});

export type SkillFrontmatterSchema = z.infer<typeof skillFrontmatterSchema>;

const FRONT_MATTER_DELIMITER = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n");
}

/**
 * Canonical: `flow`, prompt steps use `template`.
 * Aliases: top-level `steps` → `flow`; prompt field `prompt` → `template`.
 */
export function normalizeSkillFrontmatterRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...record };
  if (out.steps != null && out.flow == null) {
    out.flow = out.steps;
    delete out.steps;
  }
  const flowRaw = out.flow;
  if (Array.isArray(flowRaw)) {
    out.flow = flowRaw.map((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) return item;
      const step = { ...(item as Record<string, unknown>) };
      if (step.kind === "prompt") {
        if (typeof step.prompt === "string" && step.template == null) {
          step.template = step.prompt;
          delete step.prompt;
        }
      }
      return step;
    });
  }
  return out;
}

export function extractSkillFrontmatterYaml(markdown: string): string | null {
  const normalized = normalizeNewlines(markdown.trimStart());
  const match = normalized.match(FRONT_MATTER_DELIMITER);
  if (!match) return null;
  return match[1] ?? null;
}

function parseYamlToRecord(yamlText: string): Record<string, unknown> {
  const loaded = yaml.load(yamlText, { schema: JSON_SCHEMA });
  if (loaded == null || typeof loaded !== "object" || Array.isArray(loaded)) {
    throw new Error("Skill frontmatter YAML must parse into an object");
  }
  return normalizeSkillFrontmatterRecord(loaded as Record<string, unknown>);
}

export function safeParseSkillFrontmatterFromMarkdown(markdown: string) {
  const yamlText = extractSkillFrontmatterYaml(markdown);
  if (!yamlText) {
    return {
      success: false,
      error: new Error("Missing YAML frontmatter (expected leading --- blocks)"),
    } as const;
  }

  let record: Record<string, unknown>;
  try {
    record = parseYamlToRecord(yamlText);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
    } as const;
  }

  const parsed = skillFrontmatterSchema.safeParse(record);
  if (parsed.success) {
    return { success: true as const, data: parsed.data };
  }
  return { success: false as const, error: parsed.error };
}

/**
 * 與 {@link safeParseSkillFrontmatterFromMarkdown} 相同，但 frontmatter 的 `name` 允許暫非 kebab-case，
 * 供流程編輯器即時同步；儲存仍應使用嚴格解析。
 */
export function safeParseSkillFrontmatterFromMarkdownForFlowEditor(markdown: string) {
  const yamlText = extractSkillFrontmatterYaml(markdown);
  if (!yamlText) {
    return {
      success: false,
      error: new Error("Missing YAML frontmatter (expected leading --- blocks)"),
    } as const;
  }

  let record: Record<string, unknown>;
  try {
    record = parseYamlToRecord(yamlText);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
    } as const;
  }

  const parsed = skillFrontmatterSchemaForFlowEditor.safeParse(record);
  if (parsed.success) {
    return { success: true as const, data: parsed.data };
  }
  return { success: false as const, error: parsed.error };
}

export function parseSkillFrontmatterFromMarkdown(markdown: string): SkillFrontmatter {
  const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
  if (!parsed.success) {
    const reason = parsed.error instanceof Error ? parsed.error.message : String(parsed.error);
    throw new Error(`Invalid Skill frontmatter: ${reason}`);
  }
  return parsed.data as SkillFrontmatter;
}

/**
 * When true, the skill must be executed via the workflow runtime (API / UI), not legacy prompt concatenation.
 */
export function requiresWorkflowRuntime(frontmatter: SkillFrontmatter): boolean {
  const flow = frontmatter.flow;
  if (!flow?.length) return false;
  if (flow.some((s) => s.kind !== "prompt")) return true;
  return flow.some((s) => {
    if (s.kind !== "prompt") return false;
    return Boolean((s.depends_on && s.depends_on.length > 0) || s.output);
  });
}
