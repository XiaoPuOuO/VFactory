export const COMPANY_STATUSES = ["active", "paused", "archived"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export const DEPLOYMENT_MODES = ["authenticated"] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export const DEPLOYMENT_EXPOSURES = ["private", "public"] as const;
export type DeploymentExposure = (typeof DEPLOYMENT_EXPOSURES)[number];

export const AUTH_BASE_URL_MODES = ["auto", "explicit"] as const;
export type AuthBaseUrlMode = (typeof AUTH_BASE_URL_MODES)[number];

export const AGENT_STATUSES = [
  "active",
  "paused",
  "idle",
  "running",
  "error",
  "pending_approval",
  "terminated",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_ADAPTER_TYPES = [
  "process",
  "http",
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "gemini_local",
  "gemini_remote",
  "opencode_local",
  "pi_local",
  "cursor",
  "openclaw_gateway",
] as const;
export type AgentAdapterType = (typeof AGENT_ADAPTER_TYPES)[number];

/** Adapter types non-admin users may create/use. Only remote (API) adapters — local (CLI) is admin-only. */
export const NON_ADMIN_ALLOWED_ADAPTER_TYPES = [
  "claude_remote",
  "codex_remote",
  "gemini_remote",
] as const;
export type NonAdminAllowedAdapterType = (typeof NON_ADMIN_ALLOWED_ADAPTER_TYPES)[number];

/** Remote adapters (API) require API Key; local adapters (CLI) must not set API Key. */
export const REMOTE_ADAPTER_TYPES = [
  "claude_remote",
  "codex_remote",
  "gemini_remote",
] as const;
export type RemoteAdapterType = (typeof REMOTE_ADAPTER_TYPES)[number];

export const AGENT_ROLES = [
  "ceo",
  "cto",
  "cmo",
  "cfo",
  "engineer",
  "designer",
  "pm",
  "qa",
  "devops",
  "researcher",
  "general",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  engineer: "Engineer",
  designer: "Designer",
  pm: "PM",
  qa: "QA",
  devops: "DevOps",
  researcher: "Researcher",
  general: "General",
};

export const AGENT_ICON_NAMES = [
  "bot",
  "cpu",
  "brain",
  "zap",
  "rocket",
  "code",
  "terminal",
  "shield",
  "eye",
  "search",
  "wrench",
  "hammer",
  "lightbulb",
  "sparkles",
  "star",
  "heart",
  "flame",
  "bug",
  "cog",
  "database",
  "globe",
  "lock",
  "mail",
  "message-square",
  "file-code",
  "git-branch",
  "package",
  "puzzle",
  "target",
  "wand",
  "atom",
  "circuit-board",
  "radar",
  "swords",
  "telescope",
  "microscope",
  "crown",
  "gem",
  "hexagon",
  "pentagon",
  "fingerprint",
] as const;
export type AgentIconName = (typeof AGENT_ICON_NAMES)[number];

export const ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const GOAL_LEVELS = ["company", "team", "agent", "task"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const GOAL_STATUSES = ["planned", "active", "achieved", "cancelled"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** 一次性：完成即 achieved；daily/weekly/monthly：固定週期；custom：自訂 days/hours/minutes/seconds */
export const GOAL_RECURRENCES = ["one_time", "daily", "weekly", "monthly", "custom"] as const;
export type GoalRecurrence = (typeof GOAL_RECURRENCES)[number];

export const GOAL_RECURRENCE_INTERVAL_DAYS_MAX = 365;
export const GOAL_RECURRENCE_INTERVAL_HOURS_MAX = 23;
export const GOAL_RECURRENCE_INTERVAL_MINUTES_MAX = 59;
export const GOAL_RECURRENCE_INTERVAL_SECONDS_MAX = 59;

export const PROJECT_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
] as const;

export const APPROVAL_TYPES = ["hire_agent", "approve_ceo_strategy"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "revision_requested",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const SECRET_PROVIDERS = [
  "local_encrypted",
  "aws_secrets_manager",
  "gcp_secret_manager",
  "vault",
] as const;
export type SecretProvider = (typeof SECRET_PROVIDERS)[number];

export const STORAGE_PROVIDERS = ["local_disk", "s3"] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const HEARTBEAT_INVOCATION_SOURCES = [
  "timer",
  "assignment",
  "on_demand",
  "automation",
] as const;
export type HeartbeatInvocationSource = (typeof HEARTBEAT_INVOCATION_SOURCES)[number];

export const WAKEUP_TRIGGER_DETAILS = ["manual", "ping", "callback", "system"] as const;
export type WakeupTriggerDetail = (typeof WAKEUP_TRIGGER_DETAILS)[number];

export const WAKEUP_REQUEST_STATUSES = [
  "queued",
  "deferred_issue_execution",
  "deferred_Issue_dependencies",
  "claimed",
  "coalesced",
  "skipped",
  "completed",
  "failed",
  "cancelled",
] as const;
export type WakeupRequestStatus = (typeof WAKEUP_REQUEST_STATUSES)[number];

export const HEARTBEAT_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;
export type HeartbeatRunStatus = (typeof HEARTBEAT_RUN_STATUSES)[number];

export const LIVE_EVENT_TYPES = [
  "heartbeat.run.queued",
  "heartbeat.run.status",
  "heartbeat.run.event",
  "heartbeat.run.log",
  "agent.status",
  "activity.logged",
  "chat.message.created",
] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

export const PRINCIPAL_TYPES = ["user", "agent"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const MEMBERSHIP_STATUSES = ["pending", "active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** instance_settings 表鍵名：預設公司路徑；未設定 working_directory 的公司，其 Agent 設定目錄將放在此路徑下 (companyId) 子目錄。 */
export const INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH = "default_company_path";

export const INSTANCE_USER_ROLES = ["instance_admin"] as const;
export type InstanceUserRole = (typeof INSTANCE_USER_ROLES)[number];

export const INVITE_TYPES = ["company_join", "bootstrap_ceo"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

export const INVITE_JOIN_TYPES = ["human", "agent", "both"] as const;
export type InviteJoinType = (typeof INVITE_JOIN_TYPES)[number];

export const JOIN_REQUEST_TYPES = ["human", "agent"] as const;
export type JoinRequestType = (typeof JOIN_REQUEST_TYPES)[number];

export const JOIN_REQUEST_STATUSES = ["pending_approval", "approved", "rejected"] as const;
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];

/** 依 adapter 類型控制是否可建立／使用該類型AI員工（公司層級權限）。 */
export const MODEL_PERMISSION_KEYS = [
  "model.gemini.local",
  "model.gemini.remote",
  "model.claude.local",
  "model.claude.remote",
  "model.codex.local",
  "model.codex.remote",
  "model.cursor.local",
  "model.opencode.local",
  "model.pi.local",
  "model.openclaw_gateway",
] as const;
export type ModelPermissionKey = (typeof MODEL_PERMISSION_KEYS)[number];

export const PERMISSION_KEYS = [
  "agents:create",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "tasks:assign_scope",
  "joins:approve",
  ...MODEL_PERMISSION_KEYS,
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** adapterType -> 對應的 model.* 權限鍵（需具備該權限才能使用該 adapter）。 */
export const ADAPTER_TYPE_TO_MODEL_PERMISSION: Record<string, ModelPermissionKey> = {
  gemini_local: "model.gemini.local",
  gemini_remote: "model.gemini.remote",
  claude_local: "model.claude.local",
  claude_remote: "model.claude.remote",
  codex_local: "model.codex.local",
  codex_remote: "model.codex.remote",
  cursor: "model.cursor.local",
  opencode_local: "model.opencode.local",
  pi_local: "model.pi.local",
  openclaw_gateway: "model.openclaw_gateway",
};

/** 公司建立者（owner）預設擁有的權限，用於 ensureMembership 後呼叫 setPrincipalGrants。 */
export const DEFAULT_OWNER_GRANTS: ReadonlyArray<{ permissionKey: PermissionKey }> =
  PERMISSION_KEYS.map((permissionKey) => ({ permissionKey }));

/** Instance 身分組可設定的權限鍵（由 instance-permissions 註冊表導出）。* 表示全部權限。 */
export {
  INSTANCE_PERMISSION_KEYS,
  type InstancePermissionKey,
} from "./instance-permissions.js";
