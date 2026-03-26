export type SkillMode = "active" | "passive";

export type SkillMetadata = {
  /**
   * When true, the skill is hidden from normal discovery.
   * Used for internal / WIP skills.
   */
  internal?: boolean;
};

export type SkillArgumentType = "string" | "number" | "boolean" | "enum" | "json";

export type SkillArgumentBase = {
  /**
   * Positional argument name. This name is used for rendering templates.
   * It should be stable and unique per skill.
   */
  name: string;
  description?: string;
  /**
   * When true, invocation must provide this argument.
   */
  required?: boolean;
};

export type SkillArgumentString = SkillArgumentBase & {
  type: "string";
  default?: string;
};

export type SkillArgumentNumber = SkillArgumentBase & {
  type: "number";
  default?: number;
};

export type SkillArgumentBoolean = SkillArgumentBase & {
  type: "boolean";
  default?: boolean;
};

export type SkillArgumentEnum = SkillArgumentBase & {
  type: "enum";
  /**
   * Allowed enum values.
   * The runtime argument parser will validate against this set.
   */
  enum: string[];
  default?: string;
};

export type SkillArgumentJson = SkillArgumentBase & {
  type: "json";
  /**
   * JSON value for default.
   * The runtime system may treat JSON defaults as opaque.
   */
  default?: unknown;
};

export type SkillArgumentDefinition =
  | SkillArgumentString
  | SkillArgumentNumber
  | SkillArgumentBoolean
  | SkillArgumentEnum
  | SkillArgumentJson;

export type SkillFlowPromptStep = {
  kind: "prompt";
  /**
   * Optional step id for debugging / traceability.
   */
  id?: string;
  /**
   * Template content to inject.
   * Allowed template variables are enforced by the system (not here).
   */
  template: string;
};

export type SkillFlowStep = SkillFlowPromptStep;

export type SkillFrontmatter = {
  /**
   * Unique identifier (kebab-case).
   */
  name: string;
  /**
   * Short description: what the skill does and when to use it.
   */
  description: string;
  /**
   * How the system injects the skill.
   */
  mode: SkillMode;
  metadata?: SkillMetadata;
  /**
   * Positional arguments definition for `/skillname ...`.
   */
  arguments?: SkillArgumentDefinition[];
  /**
   * Inject this prompt directly (v0 shortcut).
   * Prefer `flow` when you need multiple prompts / steps.
   */
  prompt?: string;
  /**
   * A sequence of steps to build the injection prompt.
   */
  flow?: SkillFlowStep[];
};

