import yaml, { JSON_SCHEMA } from "js-yaml";
import { z } from "zod";
import type { SkillArgumentDefinition, SkillFlowStep, SkillFrontmatter, SkillMode } from "../types/skill.js";

const skillNameSchema = z
  .string()
  .min(1, "skill name is required")
  .max(64, "skill name max length is 64")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "skill name must be kebab-case (lowercase with hyphens)");

const skillModeSchema = z.enum(["active", "passive"]);

const skillMetadataSchema = z
  .object({
    internal: z.boolean().optional(),
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

// Note: 不使用 discriminatedUnion，因為 `skillArgumentEnumSchema` 含 `superRefine`
// 會變成 ZodEffects 包裝後導致 discriminatedUnion 在建立時就失敗。
export const skillArgumentDefinitionSchema = z.union([
  skillArgumentStringSchema,
  skillArgumentNumberSchema,
  skillArgumentBooleanSchema,
  skillArgumentEnumSchema,
  skillArgumentJsonSchema,
]) as z.ZodType<SkillArgumentDefinition>;

const skillFlowPromptStepSchema = z
  .object({
    kind: z.literal("prompt"),
    id: z.string().min(1).max(64).optional(),
    template: z.string().min(1),
  })
  .strict();

// v0 only supports `kind: "prompt"`; using `z.union([single])` breaks TypeScript inference.
export const skillFlowStepSchema = skillFlowPromptStepSchema;

export const skillFrontmatterSchema = z
  .object({
    name: skillNameSchema,
    description: z.string().min(1).max(1024),
    mode: skillModeSchema,
    metadata: skillMetadataSchema,
    arguments: z.array(skillArgumentDefinitionSchema).optional().default([]),
    prompt: z.string().min(1).optional(),
    flow: z.array(skillFlowStepSchema).optional(),
  })
  .strict()
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
  });

export type SkillFrontmatterSchema = z.infer<typeof skillFrontmatterSchema>;

const FRONT_MATTER_DELIMITER = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n");
}

export function extractSkillFrontmatterYaml(markdown: string): string | null {
  const normalized = normalizeNewlines(markdown.trimStart());
  const match = normalized.match(FRONT_MATTER_DELIMITER);
  if (!match) return null;
  return match[1] ?? null;
}

function parseYamlToRecord(yamlText: string): Record<string, unknown> {
  // Security: company-provided skill frontmatter is user-editable.
  // Use JSON_SCHEMA to keep primitive types (bool/number/etc.) correct while rejecting custom tags.
  const loaded = yaml.load(yamlText, { schema: JSON_SCHEMA });
  if (loaded == null || typeof loaded !== "object" || Array.isArray(loaded)) {
    throw new Error("Skill frontmatter YAML must parse into an object");
  }
  return loaded as Record<string, unknown>;
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

export function parseSkillFrontmatterFromMarkdown(markdown: string): SkillFrontmatter {
  const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
  if (!parsed.success) {
    const reason = parsed.error instanceof Error ? parsed.error.message : String(parsed.error);
    throw new Error(`Invalid Skill frontmatter: ${reason}`);
  }
  return parsed.data as SkillFrontmatter;
}

