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
  /** 審批與策略中心：GET /api/companies/:companyId/governance */
  companyGovernance: (companyId: string) => `${API_PREFIX}/companies/${companyId}/governance`,
  /** 自動化規則：GET/POST /api/companies/:companyId/automation-rules；PATCH/DELETE .../automation-rules/:ruleId */
  companyAutomationRules: (companyId: string) => `${API_PREFIX}/companies/${companyId}/automation-rules`,
  companyAutomationRule: (companyId: string, ruleId: string) =>
    `${API_PREFIX}/companies/${companyId}/automation-rules/${ruleId}`,
  /** 複製核准／預算政策：POST /api/companies/:companyId/policies/import-from */
  companyPoliciesImportFrom: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/policies/import-from`,
  /** 出站 Webhook：GET/POST /api/companies/:companyId/webhooks；PATCH/DELETE .../webhooks/:webhookId */
  companyWebhooks: (companyId: string) => `${API_PREFIX}/companies/${companyId}/webhooks`,
  companyWebhook: (companyId: string, webhookId: string) =>
    `${API_PREFIX}/companies/${companyId}/webhooks/${webhookId}`,
  /** Email／Slack／Discord 通知目的地 */
  companyNotificationDestinations: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/notification-destinations`,
  companyNotificationDestination: (companyId: string, destinationId: string) =>
    `${API_PREFIX}/companies/${companyId}/notification-destinations/${destinationId}`,
  companyNotificationDestinationsTest: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/notification-destinations/test`,
  companyMentionables: (companyId: string) => `${API_PREFIX}/companies/${companyId}/mentionables`,
  /** 內建 Plugin：GET/PATCH /api/companies/:companyId/plugins、PATCH .../plugins/:pluginId */
  companyPlugins: (companyId: string) => `${API_PREFIX}/companies/${companyId}/plugins`,
  companyPlugin: (companyId: string, pluginId: string) =>
    `${API_PREFIX}/companies/${companyId}/plugins/${pluginId}`,
  /** 整合 API token（非 agent）：GET/POST /api/companies/:id/integration-tokens；DELETE .../:keyId */
  companyIntegrationTokens: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/integration-tokens`,
  companyIntegrationToken: (companyId: string, keyId: string) =>
    `${API_PREFIX}/companies/${companyId}/integration-tokens/${keyId}`,
  /** 此站設定：預設公司路徑 GET/PUT /api/instance/settings/default-company-path */
  instanceSettingsDefaultCompanyPath: `${API_PREFIX}/instance/settings/default-company-path`,
  /** 實例預設合規留存天數 GET/PUT /api/instance/settings/compliance-default-retention */
  instanceSettingsComplianceDefaultRetention: `${API_PREFIX}/instance/settings/compliance-default-retention`,
  /** Agent 跨聊天記憶：POST /companies/:id/agents/me/memories（agent 寫入）；GET/DELETE /companies/:id/agents/:agentId/memories（board 或 agent 本人） */
  agentMemories: (companyId: string, agentId: string) =>
    `${API_PREFIX}/companies/${companyId}/agents/${agentId}/memories`,
  agentMeMemories: (companyId: string) =>
    `${API_PREFIX}/companies/${companyId}/agents/me/memories`,
} as const;
