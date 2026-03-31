import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { queryKeys } from "../lib/queryKeys";
import { workflowRunsApi } from "../api/workflowRuns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import "./WorkflowRunPanel.css";

type Props = {
  companyId: string;
  runId: string;
};

export function WorkflowRunPanel({ companyId, runId }: Props) {
  const { t } = useTranslation(["companySkills", "common"]);
  const queryClient = useQueryClient();
  const [promptDraft, setPromptDraft] = useState("");
  const [denyReasonDraft, setDenyReasonDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.workflowRuns.detail(companyId, runId),
    queryFn: () => workflowRunsApi.get(companyId, runId),
    refetchInterval: (q) => {
      const st = q.state.data?.run.status;
      if (
        st === "running" ||
        st === "waiting_prompt" ||
        st === "waiting_checkpoint" ||
        st === "waiting_approval" ||
        st === "waiting_worker" ||
        st === "waiting_child"
      )
        return 2000;
      return false;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns.detail(companyId, runId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workflowRuns.list(companyId) });
  };

  const promptMutation = useMutation({
    mutationFn: () => workflowRunsApi.submitPromptResult(companyId, runId, promptDraft),
    onSuccess: () => {
      setPromptDraft("");
      setActionError(null);
      invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const checkpointMutation = useMutation({
    mutationFn: (approve: boolean) => workflowRunsApi.submitCheckpoint(companyId, runId, approve),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const approvalMutation = useMutation({
    mutationFn: (input: { decision: "allow" | "deny" | "cancel"; reason?: string }) =>
      workflowRunsApi.submitApproval(companyId, runId, input),
    onSuccess: () => {
      setDenyReasonDraft("");
      setActionError(null);
      invalidate();
    },
    onError: (e: Error) => setActionError(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="workflow-run-panel">
        <p className="workflow-run-panel-status">{t("common:loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workflow-run-panel">
        <p className="workflow-run-panel-error">{t("common:error")}</p>
      </div>
    );
  }

  const { run, logs } = data;

  return (
    <div className="workflow-run-panel">
      <div className="workflow-run-panel-header">
        <h3 className="workflow-run-panel-title">{run.workflowName}</h3>
        <span className="workflow-run-panel-status">{run.status}</span>
      </div>

      <div className="workflow-run-panel-logs" aria-label={t("companySkills:workflowRunLogsLabel")}>
        {logs.map((l) => (
          <div key={l.id} className="workflow-run-panel-log-row">
            <strong>{l.stepId}</strong> · {l.status}
            {l.completedAt ? ` · ${l.completedAt}` : null}
          </div>
        ))}
      </div>

      {run.status === "waiting_prompt" && run.pendingPrompt && (
        <div className="workflow-run-panel-prompt-box">
          <div className="company-skills-field-label">{t("companySkills:workflowPendingPromptLabel")}</div>
          <pre>{run.pendingPrompt.renderedPrompt}</pre>
          <Textarea
            className="company-skills-textarea"
            rows={5}
            value={promptDraft}
            onChange={(e) => setPromptDraft(e.target.value)}
            placeholder={t("companySkills:workflowPromptResultPlaceholder")}
            spellCheck={false}
          />
          <div className="workflow-run-panel-actions">
            <Button
              size="sm"
              disabled={promptDraft.trim().length === 0 || promptMutation.isPending}
              onClick={() => promptMutation.mutate()}
            >
              {t("companySkills:workflowSubmitPromptResult")}
            </Button>
          </div>
        </div>
      )}

      {run.status === "waiting_checkpoint" && run.pendingCheckpoint && (
        <div className="workflow-run-panel-checkpoint-box">
          <div className="company-skills-field-label">{t("companySkills:workflowCheckpointLabel")}</div>
          <pre>{run.pendingCheckpoint.messageRendered}</pre>
          <div className="workflow-run-panel-actions">
            <Button size="sm" variant="default" disabled={checkpointMutation.isPending} onClick={() => checkpointMutation.mutate(true)}>
              {t("companySkills:workflowCheckpointApprove")}
            </Button>
            <Button size="sm" variant="outline" disabled={checkpointMutation.isPending} onClick={() => checkpointMutation.mutate(false)}>
              {t("companySkills:workflowCheckpointReject")}
            </Button>
          </div>
        </div>
      )}

      {run.status === "waiting_approval" && run.pendingApproval && (
        <div className="workflow-run-panel-checkpoint-box">
          <div className="company-skills-field-label">{t("companySkills:workflowApprovalLabel")}</div>
          <pre>{run.pendingApproval.messageRendered}</pre>
          <div className="company-skills-field-label">{t("companySkills:workflowApprovalDenyReasonLabel")}</div>
          <Textarea
            className="company-skills-textarea"
            rows={3}
            value={denyReasonDraft}
            onChange={(e) => setDenyReasonDraft(e.target.value)}
            placeholder={t("companySkills:workflowApprovalDenyReasonPlaceholder")}
            spellCheck={false}
          />
          <div className="workflow-run-panel-actions">
            <Button
              size="sm"
              variant="default"
              disabled={approvalMutation.isPending}
              onClick={() => approvalMutation.mutate({ decision: "allow" })}
            >
              {t("companySkills:workflowApprovalAllow")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={approvalMutation.isPending}
              onClick={() =>
                approvalMutation.mutate({
                  decision: "deny",
                  reason: denyReasonDraft.trim() || undefined,
                })
              }
            >
              {t("companySkills:workflowApprovalDeny")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={approvalMutation.isPending}
              onClick={() => approvalMutation.mutate({ decision: "cancel" })}
            >
              {t("companySkills:workflowApprovalCancel")}
            </Button>
          </div>
        </div>
      )}

      {run.status === "waiting_worker" && run.pendingWorker && (
        <div className="workflow-run-panel-child-wait" role="status">
          <p className="company-skills-field-label">{t("companySkills:workflowWorkerWaitingLabel")}</p>
          <pre className="workflow-run-panel-worker-payload">{run.pendingWorker.payload}</pre>
          <p>{t("companySkills:workflowWorkerWaitingHint")}</p>
        </div>
      )}

      {run.status === "waiting_child" && run.pendingChildRunId && (
        <div className="workflow-run-panel-child-wait" role="status">
          <p>{t("companySkills:workflowWaitingChildHint")}</p>
          <code className="workflow-run-panel-child-id">{run.pendingChildRunId}</code>
        </div>
      )}

      {run.errorMessage && <div className="workflow-run-panel-error">{run.errorMessage}</div>}
      {actionError && <div className="workflow-run-panel-error">{actionError}</div>}
    </div>
  );
}
