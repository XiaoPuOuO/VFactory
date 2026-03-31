import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { issuesApi } from "../api/issues";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { issueUrl } from "../lib/utils";
import { StatusBadge } from "./StatusBadge";
import { RunTranscriptView } from "./transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";
import { Button } from "./ui/button";

export { extractIssueIdentifiers } from "../lib/extractIssueIdentifiers";

/** 對話中嵌入的 Issue 狀態 + Run 預覽卡（與 Dashboard AgentRunCard 同概念）。 */
export function ChatMessageIssueRunCard({
  companyId,
  issueIdentifier,
  urlPrefix,
}: {
  companyId: string;
  issueIdentifier: string;
  /** 可選：公司路徑前綴，例如 "HOP"，用於建構 /HOP/issues/HOP-15 */
  urlPrefix?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: issue, isLoading: issueLoading } = useQuery({
    queryKey: queryKeys.issues.detail(issueIdentifier),
    queryFn: () => issuesApi.get(issueIdentifier),
    enabled: !!companyId && !!issueIdentifier,
  });

  const { data: liveRuns = [] } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issue?.id ?? ""),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issue!.id),
    enabled: !!issue?.id,
  });

  const { data: activeRun } = useQuery({
    queryKey: queryKeys.issues.activeRun(issue?.id ?? ""),
    queryFn: () => heartbeatsApi.activeRunForIssue(issue!.id),
    enabled: !!issue?.id,
    refetchInterval: 3000,
  });

  const stopIssueRun = useMutation({
    mutationFn: async () => {
      if (!activeRun?.id) return;
      await heartbeatsApi.cancel(activeRun.id);
    },
    onSuccess: () => {
      if (!issue?.id) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issue.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issue.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issue.id) });
    },
  });

  const effectiveRuns = activeRun ? [activeRun, ...liveRuns] : liveRuns;
  /** active-run 與 live-run 欄位形狀略有不同，hook 僅依賴 id/status。 */
  const latestRun = effectiveRuns[0] as LiveRunForIssue | undefined;
  const runsForTranscript = latestRun ? [latestRun] : [];

  const { transcriptByRun } = useLiveRunTranscripts({
    runs: runsForTranscript,
    companyId,
    maxChunksPerRun: 80,
  });

  const transcript = latestRun ? (transcriptByRun.get(latestRun.id) ?? []) : [];

  if (issueLoading || !issue) return null;

  const toIssue = issueUrl(issue);
  const href = urlPrefix ? `/${urlPrefix}${toIssue}` : toIssue;

  return (
    <div className="chat-message-issue-run-card">
      <div className="chat-message-issue-run-card-header">
        <div className="chat-message-issue-run-card-status-row">
          <span className="chat-message-issue-run-card-status">
            <StatusBadge status={issue.status} />
          </span>
          {activeRun && (
            <span className="chat-message-issue-run-card-live-dot">
              <span className="chat-message-issue-run-card-live-dot-inner" />
              Live
            </span>
          )}
        </div>
        <Link to={href} className="chat-message-issue-run-card-issue-link" title={issue.title ?? undefined}>
          {issue.identifier ?? issue.id.slice(0, 8)}
          {issue.title ? ` - ${issue.title}` : ""}
        </Link>
        <Link to={href} className="chat-message-issue-run-card-open" aria-label={t("dashboard.viewRun")}>
          <ExternalLink />
        </Link>
        {activeRun && (
          <Button
            variant="ghost"
            size="xs"
            className="chat-message-issue-run-card-stop"
            onClick={() => {
              if (!activeRun.id || stopIssueRun.isPending) return;
              stopIssueRun.mutate();
            }}
            disabled={stopIssueRun.isPending}
          >
            {stopIssueRun.isPending ? t("chatIssue.stoppingIssueFromChat") : t("chatIssue.stopIssueFromChat")}
          </Button>
        )}
      </div>
      {transcript.length > 0 && (
        <div className="chat-message-issue-run-card-body">
          <RunTranscriptView
            entries={transcript}
            density="compact"
            limit={5}
            collapseStdout
            thinkingClassName="chat-message-issue-run-thinking"
            emptyMessage=""
          />
        </div>
      )}
    </div>
  );
}
