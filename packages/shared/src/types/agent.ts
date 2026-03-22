import type {
  AgentAdapterType,
  AgentRole,
  AgentStatus,
  AutoPauseReason,
} from "../constants.js";

export interface AgentPermissions {
  canCreateAgents: boolean;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  urlKey: string;
  role: AgentRole;
  title: string | null;
  icon: string | null;
  status: AgentStatus;
  /** 當 status 為 paused 時，記錄暫停原因（budget_limit | token_limit | price_limit | manual）。 */
  autoPauseReason?: AutoPauseReason | null;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: AgentAdapterType;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  permissions: AgentPermissions;
  /**
   * 是否具備 `projects:manage` grant（僅在 Board、本人或 CEO 檢視他員時回傳）。
   * 預設為未授予；Agent API 建立／變更專案與工作區需此權限。
   */
  canManageProjects?: boolean;
  lastHeartbeatAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentKeyCreated {
  id: string;
  name: string;
  token: string;
  createdAt: Date;
}

export interface AgentConfigRevision {
  id: string;
  companyId: string;
  agentId: string;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  source: string;
  rolledBackFromRevisionId: string | null;
  changedKeys: string[];
  beforeConfig: Record<string, unknown>;
  afterConfig: Record<string, unknown>;
  createdAt: Date;
}

export type AdapterEnvironmentCheckLevel = "info" | "warn" | "error";
export type AdapterEnvironmentTestStatus = "pass" | "warn" | "fail";

export interface AdapterEnvironmentCheck {
  code: string;
  level: AdapterEnvironmentCheckLevel;
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: AdapterEnvironmentTestStatus;
  checks: AdapterEnvironmentCheck[];
  testedAt: string;
}
