export const queryKeys = {
  companies: {
    all: ["companies"] as const,
    detail: (id: string) => ["companies", id] as const,
    allowedAdapterTypes: (id: string) => ["companies", id, "allowed-adapter-types"] as const,
    plugins: (companyId: string) => ["companies", companyId, "plugins"] as const,
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
    detail: (id: string) => ["issues", "detail", id] as const,
    comments: (issueId: string) => ["issues", "comments", issueId] as const,
    attachments: (issueId: string) => ["issues", "attachments", issueId] as const,
    activity: (issueId: string) => ["issues", "activity", issueId] as const,
    runs: (issueId: string) => ["issues", "runs", issueId] as const,
    approvals: (issueId: string) => ["issues", "approvals", issueId] as const,
    liveRuns: (issueId: string) => ["issues", "live-runs", issueId] as const,
    activeRun: (issueId: string) => ["issues", "active-run", issueId] as const,
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
  instanceSettings: {
    defaultCompanyPath: ["instance", "settings", "default-company-path"] as const,
  },
  secrets: {
    list: (companyId: string) => ["secrets", companyId] as const,
    providers: (companyId: string) => ["secret-providers", companyId] as const,
  },
  dashboard: (companyId: string) => ["dashboard", companyId] as const,
  sidebarBadges: (companyId: string) => ["sidebar-badges", companyId] as const,
  activity: (companyId: string) => ["activity", companyId] as const,
  costs: (companyId: string, from?: string, to?: string) =>
    ["costs", companyId, from, to] as const,
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
