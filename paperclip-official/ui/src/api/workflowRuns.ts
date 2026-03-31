import { api } from "./client";

export type WorkflowPendingApproval = {
  stepId: string;
  messageRendered: string;
  createdAt: string;
  gate: "before_step";
};

export type WorkflowPendingWorker = {
  stepId: string;
  kind: string;
  payload: string;
  createdAt: string;
};

export type WorkflowRunListRow = {
  id: string;
  workflowName: string;
  skillKey: string;
  status: string;
  currentStepId: string | null;
  pendingPrompt: { stepId: string; renderedPrompt: string; createdAt: string } | null;
  pendingCheckpoint: { stepId: string; messageRendered: string; createdAt: string } | null;
  pendingApproval: WorkflowPendingApproval | null;
  pendingWorker: WorkflowPendingWorker | null;
  chatRoomId: string | null;
  pendingChildRunId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRunDetail = {
  run: {
    id: string;
    companyId: string;
    agentId: string | null;
    workflowName: string;
    skillKey: string;
    status: string;
    currentStepId: string | null;
    context: Record<string, unknown>;
    pendingPrompt: WorkflowRunListRow["pendingPrompt"];
    pendingCheckpoint: WorkflowRunListRow["pendingCheckpoint"];
    pendingApproval: WorkflowRunListRow["pendingApproval"];
    pendingWorker: WorkflowRunListRow["pendingWorker"];
    chatRoomId: string | null;
    pendingChildRunId: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  };
  logs: Array<{
    id: string;
    stepId: string;
    status: string;
    input: string | null;
    output: string | null;
    meta: Record<string, unknown> | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
};

export const workflowRunsApi = {
  list: (companyId: string, params?: { limit?: number; workflowName?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.workflowName) sp.set("workflowName", params.workflowName);
    const q = sp.toString();
    return api.get<{ runs: WorkflowRunListRow[] }>(
      `/companies/${companyId}/workflow-runs${q ? `?${q}` : ""}`,
    );
  },

  get: (companyId: string, runId: string) =>
    api.get<WorkflowRunDetail>(`/companies/${companyId}/workflow-runs/${encodeURIComponent(runId)}`),

  start: (
    companyId: string,
    skillKey: string,
    body: { args?: string[]; agentId?: string | null; chatRoomId?: string | null },
  ) =>
    api.post<{ runId: string; status: string }>(
      `/companies/${companyId}/workflows/${encodeURIComponent(skillKey)}/run`,
      body,
    ),

  submitPromptResult: (companyId: string, runId: string, outputText: string) =>
    api.post<{ ok: true; status?: string }>(
      `/companies/${companyId}/workflow-runs/${encodeURIComponent(runId)}/prompt-result`,
      { outputText },
    ),

  submitCheckpoint: (companyId: string, runId: string, approve: boolean) =>
    api.post<{ ok: true; status?: string }>(
      `/companies/${companyId}/workflow-runs/${encodeURIComponent(runId)}/checkpoint`,
      { approve },
    ),

  submitApproval: (
    companyId: string,
    runId: string,
    body: { decision: "allow" | "deny" | "cancel"; reason?: string },
  ) =>
    api.post<{ ok: true; status?: string }>(
      `/companies/${companyId}/workflow-runs/${encodeURIComponent(runId)}/approval`,
      body,
    ),

  cancel: (companyId: string, runId: string) =>
    api.delete<void>(`/companies/${companyId}/workflow-runs/${encodeURIComponent(runId)}`),
};
