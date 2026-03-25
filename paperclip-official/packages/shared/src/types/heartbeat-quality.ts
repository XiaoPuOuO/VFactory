import type { HeartbeatRun } from "./heartbeat.js";

/** GET .../heartbeat-runs 分頁回應 */
export interface HeartbeatRunsListResponse {
  runs: HeartbeatRun[];
  nextCursor: string | null;
}

export interface HeartbeatRunQualityCompanyTotals {
  totalRuns: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  totalTokens: number;
}

export interface HeartbeatRunQualityAgentRow {
  agentId: string;
  totalRuns: number;
  succeeded: number;
  failed: number;
  avgDurationMs: number | null;
  totalTokens: number;
}

export interface HeartbeatRunQualitySummary {
  from: string;
  to: string;
  company: HeartbeatRunQualityCompanyTotals;
  agents: HeartbeatRunQualityAgentRow[];
}

export interface HeartbeatRunErrorCluster {
  /** 內部分組鍵：`code:xxx` 或 `norm:...` */
  key: string;
  errorCode: string | null;
  normalizedMessage: string | null;
  count: number;
  sampleRunIds: string[];
  agentIds: string[];
}
