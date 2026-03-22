import type {
  HeartbeatRun,
  HeartbeatRunEvent,
  HeartbeatRunErrorCluster,
  HeartbeatRunQualitySummary,
  HeartbeatRunsListResponse,
} from "@paperclipai/shared";
import { api } from "./client";

export interface ActiveRunForIssue extends HeartbeatRun {
  agentId: string;
  agentName: string;
  adapterType: string;
}

export interface LiveRunForIssue {
  id: string;
  status: string;
  invocationSource: string;
  triggerDetail: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  issueId?: string | null;
}

export const heartbeatsApi = {
  list: (
    companyId: string,
    opts?: {
      agentId?: string;
      limit?: number;
      startedAfter?: Date;
      endedBefore?: Date;
      status?: string;
      invocationSource?: string;
      cursor?: string;
    },
  ) => {
    const searchParams = new URLSearchParams();
    if (opts?.agentId) searchParams.set("agentId", opts.agentId);
    if (opts?.limit != null) searchParams.set("limit", String(opts.limit));
    if (opts?.startedAfter) searchParams.set("startedAfter", opts.startedAfter.toISOString());
    if (opts?.endedBefore) searchParams.set("endedBefore", opts.endedBefore.toISOString());
    if (opts?.status) searchParams.set("status", opts.status);
    if (opts?.invocationSource) searchParams.set("invocationSource", opts.invocationSource);
    if (opts?.cursor) searchParams.set("cursor", opts.cursor);
    const qs = searchParams.toString();
    return api.get<HeartbeatRunsListResponse>(
      `/companies/${companyId}/heartbeat-runs${qs ? `?${qs}` : ""}`,
    );
  },
  qualitySummary: (companyId: string, from: Date, to: Date) => {
    const searchParams = new URLSearchParams();
    searchParams.set("from", from.toISOString());
    searchParams.set("to", to.toISOString());
    return api.get<HeartbeatRunQualitySummary>(
      `/companies/${companyId}/heartbeat-runs/quality-summary?${searchParams.toString()}`,
    );
  },
  errorClusters: (companyId: string, from: Date, to: Date) => {
    const searchParams = new URLSearchParams();
    searchParams.set("from", from.toISOString());
    searchParams.set("to", to.toISOString());
    return api.get<HeartbeatRunErrorCluster[]>(
      `/companies/${companyId}/heartbeat-runs/error-clusters?${searchParams.toString()}`,
    );
  },
  get: (runId: string) => api.get<HeartbeatRun>(`/heartbeat-runs/${runId}`),
  events: (runId: string, afterSeq = 0, limit = 200) =>
    api.get<HeartbeatRunEvent[]>(
      `/heartbeat-runs/${runId}/events?afterSeq=${encodeURIComponent(String(afterSeq))}&limit=${encodeURIComponent(String(limit))}`,
    ),
  log: (runId: string, offset = 0, limitBytes = 256000) =>
    api.get<{ runId: string; store: string; logRef: string; content: string; nextOffset?: number }>(
      `/heartbeat-runs/${runId}/log?offset=${encodeURIComponent(String(offset))}&limitBytes=${encodeURIComponent(String(limitBytes))}`,
    ),
  cancel: (runId: string) => api.post<void>(`/heartbeat-runs/${runId}/cancel`, {}),
  retryWake: (runId: string) =>
    api.post<{ runId: string | null }>(`/heartbeat-runs/${runId}/retry-wake`, {}),
  liveRunsForIssue: (issueId: string) =>
    api.get<LiveRunForIssue[]>(`/issues/${issueId}/live-runs`),
  activeRunForIssue: (issueId: string) =>
    api.get<ActiveRunForIssue | null>(`/issues/${issueId}/active-run`),
  liveRunsForCompany: (companyId: string, minCount?: number) =>
    api.get<LiveRunForIssue[]>(`/companies/${companyId}/live-runs${minCount ? `?minCount=${minCount}` : ""}`),
};
