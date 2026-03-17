export const API_PREFIX = "/api";

export const API = {
  health: `${API_PREFIX}/health`,
  /** 目前請求的租戶資訊（需已解析出租戶） */
  tenant: `${API_PREFIX}/tenant`,
  /** 目前使用者所屬租戶列表（登入後租戶選擇用） */
  tenantsMe: `${API_PREFIX}/tenants/me`,
  companies: `${API_PREFIX}/companies`,
  agents: `${API_PREFIX}/agents`,
  projects: `${API_PREFIX}/projects`,
  issues: `${API_PREFIX}/issues`,
  goals: `${API_PREFIX}/goals`,
  approvals: `${API_PREFIX}/approvals`,
  secrets: `${API_PREFIX}/secrets`,
  costs: `${API_PREFIX}/costs`,
  activity: `${API_PREFIX}/activity`,
  dashboard: `${API_PREFIX}/dashboard`,
  sidebarBadges: `${API_PREFIX}/sidebar-badges`,
  invites: `${API_PREFIX}/invites`,
  joinRequests: `${API_PREFIX}/join-requests`,
  members: `${API_PREFIX}/members`,
  admin: `${API_PREFIX}/admin`,
  /** 公司排程：GET/POST /api/companies/:companyId/schedules；GET/PATCH/DELETE .../schedules/:scheduleId */
  companySchedules: (companyId: string) => `${API_PREFIX}/companies/${companyId}/schedules`,
  /** 此站設定：預設公司路徑 GET/PUT /api/instance/settings/default-company-path */
  instanceSettingsDefaultCompanyPath: `${API_PREFIX}/instance/settings/default-company-path`,
  /** Agent 跨聊天記憶：POST /companies/:id/agents/me/memories（agent 寫入）；GET/DELETE /companies/:id/agents/:agentId/memories（board 或 agent 本人） */
  agentMemories: (companyId: string, agentId: string) =>
    `${API_PREFIX}/companies/${companyId}/agents/${agentId}/memories`,
  agentMeMemories: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/agents/me/memories`,
} as const;
