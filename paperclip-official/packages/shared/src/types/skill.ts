export type SkillMode = "active" | "passive";

export type SkillMetadata = {
  /**
   * When true, the skill is hidden from normal discovery.
   * Used for internal / WIP skills.
   */
  internal?: boolean;
  /**
   * Optional hints for **passive** skill injection: when non-empty, the passive skill
   * is only prepended to the prompt if at least one hint matches (case-insensitive
   * substring) the heartbeat wake context string (wakeReason, labels, etc.).
   * When omitted or empty, passive skills behave as before (subject to global char budget).
   */
  passiveWakeHints?: string[];
};

export type SkillArgumentType = "string" | "number" | "boolean" | "enum" | "json";

export type SkillArgumentBase = {
  /**
   * 模板與 workflow context 中的變數鍵：`{{name}}`，並與 `/skill-name` 後方**位置參數**依 `arguments` 陣列順序對應（第一個 arg ← 第一個 token）。
   * 須為穩定且於技能內唯一。
   */
  name: string;
  /**
   * 人類可讀顯示名稱（表單／說明）；不參與 `{{...}}` 解析。
   */
  label?: string;
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

export type WorkflowTrigger = {
  on: "manual" | "schedule" | "event";
};

export type SkillFlowPromptStep = {
  kind: "prompt";
  /**
   * Required when flow has multiple steps or any non-prompt step (enforced in Zod superRefine).
   */
  id?: string;
  name?: string;
  /**
   * Template content to inject / execute for this step.
   */
  template: string;
  /**
   * When set, the step output is stored in workflow context under this key.
   */
  output?: string;
  /**
   * 是否需要由人類提交此步驟結果（Board/對話貼上或輸入）。
   *
   * - `true` 或省略：進入 `waiting_prompt`
   * - `false`：由執行端（worker/session 或 server LLM 後援）自動產出並提交
   */
  require_human_input?: boolean;
  /**
   * 若為 true：此步驟開始執行前需人工 Allow（對話／面板）；Deny 附 reason 則重試同一步、不終止 run。
   */
  require_approval_before?: boolean;
  /**
   * 標記為高風險時，即使未設 require_approval_before，仍強制進入人工審批（與 dangerous_action_registry 策略一致）。
   */
  dangerous?: boolean;
  depends_on?: string[];
};

export type SkillFlowCheckpointStep = {
  kind: "checkpoint";
  id: string;
  name?: string;
  message: string;
  on_approve: string;
  on_reject: string;
  /**
   * 已廢棄：執行器一律自動核准（走 on_approve），不再進入 `waiting_checkpoint`。舊 YAML 若仍帶此欄位會被忽略。
   */
  require_human_confirm?: boolean;
  timeout_hours?: number;
  /** 見 {@link SkillFlowPromptStep.require_approval_before} */
  require_approval_before?: boolean;
  depends_on?: string[];
};

export type SkillFlowConditionStep = {
  kind: "condition";
  id: string;
  name?: string;
  /**
   * Mini-DSL expression, e.g. `{{tier}} == 'premium'` (evaluated by workflow engine).
   */
  condition: string;
  if_true: string;
  if_false: string;
  /** 見 {@link SkillFlowPromptStep.require_approval_before} */
  require_approval_before?: boolean;
  depends_on?: string[];
};

export type WorkflowBuiltinAction = "create_issue";

export type SkillFlowActionStep = {
  kind: "action";
  id: string;
  name?: string;
  action: WorkflowBuiltinAction;
  params: Record<string, string>;
  /** 見 {@link SkillFlowPromptStep.require_approval_before} */
  require_approval_before?: boolean;
  /** 見 {@link SkillFlowPromptStep.dangerous} */
  dangerous?: boolean;
  depends_on?: string[];
};

export type SkillFlowLoopStep = {
  kind: "loop";
  id: string;
  name?: string;
  /**
   * Context key whose value is a JSON array to iterate.
   */
  list_from: string;
  /**
   * Variable name bound to each element during body execution.
   */
  item_as: string;
  /**
   * Step ids to run for each item (must be prompt steps in v1).
   */
  body: string[];
  /** 見 {@link SkillFlowPromptStep.require_approval_before} */
  require_approval_before?: boolean;
  depends_on?: string[];
};

/**
 * 呼叫同公司另一個「工作流程技能」（必須為 active 且具 flow，且需通過 workflow runtime 載入）。
 * 子流程完成後，可選將摘要寫入 `output` 所指之 context 鍵。
 */
export type SkillFlowInvokeWorkflowStep = {
  kind: "invoke_workflow";
  id: string;
  name?: string;
  /** 目標技能之 `name`（kebab-case），須已存在於公司技能庫 */
  skill_key: string;
  /** 傳入子技能的 positional 參數，每項可依父 context 使用 `{{var}}` 渲染 */
  args?: string[];
  /** 子流程成功結束後，將 JSON 摘要字串寫入 context 的鍵名 */
  output?: string;
  /** 見 {@link SkillFlowPromptStep.require_approval_before} */
  require_approval_before?: boolean;
  /** 見 {@link SkillFlowPromptStep.dangerous} */
  dangerous?: boolean;
  depends_on?: string[];
};

export type SkillFlowStep =
  | SkillFlowPromptStep
  | SkillFlowCheckpointStep
  | SkillFlowConditionStep
  | SkillFlowActionStep
  | SkillFlowLoopStep
  | SkillFlowInvokeWorkflowStep;

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
   * A sequence of steps to build the injection prompt or workflow.
   */
  flow?: SkillFlowStep[];
  /**
   * Optional workflow trigger metadata (UI / future scheduling).
   */
  trigger?: WorkflowTrigger;
};
