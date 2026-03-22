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

/** 當 agent 為 paused 時，記錄暫停原因（API/UI 顯示 badge 用）。 */
export const AUTO_PAUSE_REASONS = [
  "budget_limit",
  "budget_policy",
  "token_limit",
  "price_limit",
  "manual",
  "automation_rule",
] as const;
export type AutoPauseReason = (typeof AUTO_PAUSE_REASONS)[number];

/** 多維度預算策略：範圍類型。 */
export const BUDGET_POLICY_SCOPE_TYPES = ["project", "billing_code", "company"] as const;
export type BudgetPolicyScopeType = (typeof BUDGET_POLICY_SCOPE_TYPES)[number];

/** 策略時間窗（目前僅 UTC 曆月）。 */
export const BUDGET_POLICY_PERIODS = ["calendar_month_utc"] as const;
export type BudgetPolicyPeriod = (typeof BUDGET_POLICY_PERIODS)[number];

/** 超標後行為。 */
export const BUDGET_POLICY_ON_EXCEED = [
  "record_only",
  "block_new_runs_for_scope",
  "pause_agents",
] as const;
export type BudgetPolicyOnExceed = (typeof BUDGET_POLICY_ON_EXCEED)[number];

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

/** 核准決策來源：人工、依公司政策自動、或系統內部。 */
export const APPROVAL_DECISION_SOURCES = ["human", "policy", "system"] as const;
export type ApprovalDecisionSource = (typeof APPROVAL_DECISION_SOURCES)[number];

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

/**
 * 內建、編譯期註冊之非 adapter Plugin id（DB `company_plugins.plugin_id` 須為其中一值）。
 * 新增 id 時須同步註冊 server `plugins/registry` 與 migration 無需改欄位（text）。
 */
export const BUILTIN_PLUGIN_IDS = ["noop"] as const;
export type BuiltinPluginId = (typeof BUILTIN_PLUGIN_IDS)[number];

export const PRINCIPAL_TYPES = ["user", "agent"] as const;
export type PrincipalType = (typeof PRINCIPAL_TYPES)[number];

export const MEMBERSHIP_STATUSES = ["pending", "active", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** 公司內人類成員角色（board 操作者）；權限以 principal_permission_grants 與角色預設為準。 */
export const COMPANY_MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type CompanyMembershipRole = (typeof COMPANY_MEMBERSHIP_ROLES)[number];

export function isCompanyMembershipRole(value: string | null | undefined): value is CompanyMembershipRole {
  return (
    typeof value === "string" &&
    (COMPANY_MEMBERSHIP_ROLES as readonly string[]).includes(value)
  );
}

/** instance_settings 表鍵名：預設公司路徑；未設定 working_directory 的公司，其 Agent 設定目錄將放在此路徑下 (companyId) 子目錄。 */
export const INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH = "default_company_path";

/** 實例預設合規留存天數（字串整數）；公司 compliance_data_retention_days 為 null 時語意上繼承此值。不自動 purge。 */
export const INSTANCE_SETTING_KEY_COMPLIANCE_DEFAULT_RETENTION_DAYS =
  "compliance_default_retention_days";

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
  "agents:admin",
  "users:invite",
  "users:manage_permissions",
  "tasks:assign",
  "tasks:assign_scope",
  "joins:approve",
  "approvals:resolve",
  "governance:policies:manage",
  "budgets:manage",
  "company:manage",
  /** Agent 建立／更新／刪除專案與工作區；預設不授予，需由 Board／CEO 於 principal grants 明確開啟。 */
  "projects:manage",
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

/**
 * 整合 API token（非 agent）可授予之唯讀／有限範圍，與 board 的 PermissionKey 分離。
 * 路由層以 assertCompanyIntegrationScope 檢查。
 */
export const INTEGRATION_TOKEN_SCOPES = [
  "costs:read",
  "issues:read",
  "activity:read",
  "goals:read",
  "projects:read",
  "agents:read",
  "approvals:read",
] as const;
export type IntegrationTokenScope = (typeof INTEGRATION_TOKEN_SCOPES)[number];

export function isIntegrationTokenScope(value: string): value is IntegrationTokenScope {
  return (INTEGRATION_TOKEN_SCOPES as readonly string[]).includes(value);
}

/** 公司出站 Webhook 可訂閱之事件型別。 */
export const COMPANY_WEBHOOK_EVENT_TYPES = [
  "issue.created",
  "issue.updated",
  "issue.comment_created",
  "approval.created",
  "budget.limit_breached",
] as const;
export type CompanyWebhookEventType = (typeof COMPANY_WEBHOOK_EVENT_TYPES)[number];

/** 公司通知目的地通道（Email SMTP、Slack/Discord Incoming Webhook）。 */
export const NOTIFICATION_CHANNEL_TYPES = ["email", "slack", "discord"] as const;
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number];

/** Instance 身分組可設定的權限鍵（由 instance-permissions 註冊表導出）。* 表示全部權限。 */
export {
  INSTANCE_PERMISSION_KEYS,
  type InstancePermissionKey,
} from "./instance-permissions.js";
