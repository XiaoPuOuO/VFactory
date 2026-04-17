export const queryKeys = {
  companies: {
    all: ["companies"] as const,
    detail: (id: string) => ["companies", id] as const,
    allowedAdapterTypes: (id: string) => ["companies", id, "allowed-adapter-types"] as const,
    plugins: (companyId: string) => ["companies", companyId, "plugins"] as const,
    webhooks: (companyId: string) => ["companies", companyId, "webhooks"] as const,
    integrationTokens: (companyId: string) => ["companies", companyId, "integration-tokens"] as const,
    notificationDestinations: (companyId: string) =>
      ["companies", companyId, "notificationDestinations"] as const,
    mentionables: (companyId: string) => ["companies", companyId, "mentionables"] as const,
    stats: ["companies", "stats"] as const,
  },
  agents: {
    list: (companyId: string) => ["agents", companyId] as const,
    detail: (id: string) => ["agents", "detail", id] as const,
    runtimeState: (id: string) => ["agents", "runtime-state", id] as const,
    taskSessions: (id: string) => ["agents", "task-sessions", id] as const,
    keys: (agentId: string) => ["agents", "keys", agentId] as const,
    configRevisions: (agentId: string) => ["agents", "config-revisions", agentId] as const,
    adapterModels: (companyId: string, adapterType: string) =>
      ["agents", companyId, "adapter-models", adapterType] as const,
    memories: (
      companyId: string,
      agentId: string,
      filters?: { q?: string; sourceRoomId?: string; limit?: number },
    ) => ["agents", "memories", companyId, agentId, filters ?? null] as const,
  },
  issues: {
    list: (companyId: string) => ["issues", companyId] as const,
    search: (companyId: string, q: string, projectId?: string) =>
      ["issues", companyId, "search", q, projectId ?? "__all-projects__"] as const,
    listAssignedToMe: (companyId: string) => ["issues", companyId, "assigned-to-me"] as const,
    listTouchedByMe: (companyId: string) => ["issues", companyId, "touched-by-me"] as const,
    listUnreadTouchedByMe: (companyId: string) => ["issues", companyId, "unread-touched-by-me"] as const,
    labels: (companyId: string) => ["issues", companyId, "labels"] as const,
    listByProject: (companyId: string, projectId: string) =>
      ["issues", companyId, "project", projectId] as const,
    savedViews: (companyId: string, scopeKey: string) =>
      ["issues", companyId, "savedViews", scopeKey] as const,
    detail: (id: string) => ["issues", "detail", id] as const,
    comments: (issueId: string) => ["issues", "comments", issueId] as const,
    attachments: (issueId: string) => ["issues", "attachments", issueId] as const,
    activity: (issueId: string) => ["issues", "activity", issueId] as const,
    runs: (issueId: string) => ["issues", "runs", issueId] as const,
    approvals: (issueId: string) => ["issues", "approvals", issueId] as const,
    liveRuns: (issueId: string) => ["issues", "live-runs", issueId] as const,
    activeRun: (issueId: string) => ["issues", "active-run", issueId] as const,
    subscription: (issueId: string) => ["issues", "subscription", issueId] as const,
  },
  projects: {
    list: (companyId: string) => ["projects", companyId] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
  },
  goals: {
    list: (companyId: string) => ["goals", companyId] as const,
    detail: (id: string) => ["goals", "detail", id] as const,
    progress: (goalId: string, costPreset: "mtd" | "all") =>
      ["goals", "progress", goalId, costPreset] as const,
  },
  schedules: {
    list: (companyId: string, filters?: { agentId?: string; enabled?: boolean }) =>
      ["schedules", companyId, filters ?? null] as const,
    detail: (companyId: string, scheduleId: string) =>
      ["schedules", companyId, "detail", scheduleId] as const,
    conflicts: (companyId: string, horizonDays: number, thresholdSec: number) =>
      ["schedules", companyId, "conflicts", horizonDays, thresholdSec] as const,
  },
  companySkills: {
    /**
     * 技能／工作流程相關查詢前綴。mutation 後請搭配
     * `invalidateQueries({ queryKey: root(id), refetchType: "all" })`，否則僅會 refetch
     * 當下「active」的查詢；從全頁編輯返回列表時列表快取可能仍為 inactive 而不會立即重抓。
     */
    root: (companyId: string) => ["company-skills", companyId] as const,
    list: (companyId: string, includeInternal?: boolean) =>
      ["company-skills", companyId, includeInternal ?? false] as const,
    exportLatest: (companyId: string) => ["company-skills", companyId, "export-latest"] as const,
  },
  workflowRuns: {
    list: (companyId: string) => ["workflow-runs", companyId] as const,
    detail: (companyId: string, runId: string) => ["workflow-runs", companyId, runId] as const,
  },
  runQuality: {
    summary: (companyId: string, from: string, to: string) =>
      ["run-quality", "summary", companyId, from, to] as const,
    clusters: (companyId: string, from: string, to: string) =>
      ["run-quality", "clusters", companyId, from, to] as const,
    list: (companyId: string, filters: unknown) =>
      ["run-quality", "list", companyId, filters] as const,
  },
  approvals: {
    list: (companyId: string, status?: string) =>
      ["approvals", companyId, status] as const,
    detail: (approvalId: string) => ["approvals", "detail", approvalId] as const,
    comments: (approvalId: string) => ["approvals", "comments", approvalId] as const,
    issues: (approvalId: string) => ["approvals", "issues", approvalId] as const,
  },
  governance: {
    hub: (companyId: string) => ["governance", "hub", companyId] as const,
    hirePolicy: (companyId: string) => ["governance", "hirePolicy", companyId] as const,
  },
  access: {
    joinRequests: (companyId: string, status: string = "pending_approval") =>
      ["access", "join-requests", companyId, status] as const,
    invite: (token: string) => ["access", "invite", token] as const,
  },
  auth: {
    session: ["auth", "session"] as const,
    providers: ["auth", "providers"] as const,
  },
  tenants: {
    current: ["tenants", "current"] as const,
    me: ["tenants", "me"] as const,
  },
  health: ["health"] as const,
  instanceGroups: {
    all: ["instance", "groups"] as const,
    permissionsRegistry: ["instance", "groups", "permissions"] as const,
    defaultGroup: ["instance", "groups", "default-group"] as const,
    detail: (id: string) => ["instance", "groups", id] as const,
  },
  instanceUsers: {
    all: ["instance", "users"] as const,
  },
  instancePlans: {
    all: ["instance", "plans"] as const,
  },
  instanceSettings: {
    defaultCompanyPath: ["instance", "settings", "default-company-path"] as const,
    complianceDefaultRetention: ["instance", "settings", "compliance-default-retention"] as const,
    billingIgnorePlanUsageCaps: ["instance", "settings", "billing-ignore-plan-usage-caps"] as const,
  },
  secrets: {
    list: (companyId: string) => ["secrets", companyId] as const,
    providers: (companyId: string) => ["secret-providers", companyId] as const,
  },
  dashboard: (companyId: string) => ["dashboard", companyId] as const,
  dashboardTrends: (companyId: string, days: number) =>
    ["dashboard", "trends", companyId, days] as const,
  sidebarBadges: (companyId: string) => ["sidebar-badges", companyId] as const,
  activity: (companyId: string) => ["activity", companyId] as const,
  costs: (companyId: string, from?: string, to?: string) =>
    ["costs", companyId, from, to] as const,
  /**
   * 供 invalidate/refetch：命中該公司所有日期區間的 costs 查詢。
   * 勿單獨使用 costs(companyId) — 會變成 ["costs", id, undefined, undefined]，與實際 queryKey 的 from/to 字串比對失敗，快取不會更新。
   */
  costsAllRanges: (companyId: string) => ["costs", companyId] as const,
  billing: {
    plans: (companyId: string) => ["billing", "plans", companyId] as const,
    company: (companyId: string) => ["billing", "company", companyId] as const,
  },
  budgetPolicies: (companyId: string) => ["budget-policies", companyId] as const,
  heartbeats: (companyId: string, agentId?: string) =>
    ["heartbeats", companyId, agentId] as const,
  runDetail: (runId: string) => ["heartbeat-run", runId] as const,
  liveRuns: (companyId: string) => ["live-runs", companyId] as const,
  runIssues: (runId: string) => ["run-issues", runId] as const,
  org: (companyId: string) => ["org", companyId] as const,
  chat: {
    rooms: (companyId: string) => ["chat", "rooms", companyId] as const,
    room: (companyId: string, roomId: string) =>
      ["chat", "room", companyId, roomId] as const,
    messages: (companyId: string, roomId: string) =>
      ["chat", "messages", companyId, roomId] as const,
    activeRuns: (companyId: string, roomId: string) =>
      ["chat", "activeRuns", companyId, roomId] as const,
    listPreferences: (companyId: string) =>
      ["chat", "listPreferences", companyId] as const,
  },
};
