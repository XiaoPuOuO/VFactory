import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import type { TranscriptEntry } from "../adapters";
import { queryKeys } from "../lib/queryKeys";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { ExternalLink } from "lucide-react";
import { Identity } from "./Identity";
import { RunTranscriptView } from "./transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";

const MIN_DASHBOARD_RUNS = 4;

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

interface ActiveAgentsPanelProps {
  companyId: string;
}

export function ActiveAgentsPanel({ companyId }: ActiveAgentsPanelProps) {
  const { t } = useTranslation();
  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MIN_DASHBOARD_RUNS),
  });

  const runs = liveRuns ?? [];
  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: runs.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  const { transcriptByRun, hasOutputForRun } = useLiveRunTranscripts({
    runs,
    companyId,
    maxChunksPerRun: 120,
  });

  return (
    <div className="dashboard-agents-panel">
      <h3>{t("dashboard.agentsSection")}</h3>
      {runs.length === 0 ? (
        <div className="dashboard-agents-panel-empty">
          <p className="dashboard-agents-panel-empty-text">{t("dashboard.noRecentAgentRuns")}</p>
        </div>
      ) : (
        <div className="dashboard-agents-panel-grid">
          {runs.map((run) => (
            <AgentRunCard
              key={run.id}
              run={run}
              issue={run.issueId ? issueById.get(run.issueId) : undefined}
              transcript={transcriptByRun.get(run.id) ?? []}
              hasOutput={hasOutputForRun(run.id)}
              isActive={isRunActive(run)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentRunCard({
  run,
  issue,
  transcript,
  hasOutput,
  isActive,
}: {
  run: LiveRunForIssue;
  issue?: Issue;
  transcript: TranscriptEntry[];
  hasOutput: boolean;
  isActive: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={["dashboard-agent-run-card", isActive && "active"].filter(Boolean).join(" ")}>
      <div className="dashboard-agent-run-card-header">
        <div className="dashboard-agent-run-card-header-inner">
          <div className="dashboard-agent-run-card-header-left">
            <div className="dashboard-agent-run-card-header-row">
              {isActive ? (
                <span className="dashboard-agent-run-card-live-dot">
                  <span className="dashboard-agent-run-card-live-dot-ping" />
                </span>
              ) : (
                <span className="dashboard-agent-run-card-live-dot-idle" />
              )}
              <Identity name={run.agentName} size="sm" className="dashboard-agent-run-card-identity" />
            </div>
            <div className="dashboard-agent-run-card-meta">
              <span>{isActive ? t("dashboard.liveNow") : run.finishedAt ? t("dashboard.finishedAgo", { time: formatRelativeTime(t, run.finishedAt) }) : t("dashboard.startedAgo", { time: formatRelativeTime(t, run.createdAt) })}</span>
            </div>
          </div>

          <Link
            to={`/agents/${run.agentId}/runs/${run.id}`}
            className="dashboard-agent-run-card-link"
            aria-label={t("dashboard.viewRun")}
          >
            <ExternalLink />
          </Link>
        </div>

        {run.issueId && (
          <div className="dashboard-agent-run-card-issue">
            <Link
              to={`/issues/${issue?.identifier ?? run.issueId}`}
              className={["dashboard-agent-run-card-issue-link", isActive && "active"].filter(Boolean).join(" ")}
              title={issue?.title ? `${issue?.identifier ?? run.issueId.slice(0, 8)} - ${issue.title}` : issue?.identifier ?? run.issueId.slice(0, 8)}
            >
              {issue?.identifier ?? run.issueId.slice(0, 8)}
              {issue?.title ? ` - ${issue.title}` : ""}
            </Link>
          </div>
        )}
      </div>

      <div className="dashboard-agent-run-card-body">
        <RunTranscriptView
          entries={transcript}
          density="compact"
          limit={5}
          streaming={isActive}
          collapseStdout
          thinkingClassName="!text-[10px] !leading-4"
          emptyMessage={hasOutput ? t("dashboard.waitingForTranscript") : isActive ? t("dashboard.waitingForOutput") : t("dashboard.noTranscriptCaptured")}
        />
      </div>
    </div>
  );
}
