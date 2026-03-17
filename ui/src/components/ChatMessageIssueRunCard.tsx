import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { issuesApi } from "../api/issues";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { issueUrl } from "../lib/utils";
import { StatusBadge } from "./StatusBadge";
import { RunTranscriptView } from "./transcript/RunTranscriptView";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";

/**
 * 從訊息內文擷取 Issue 識別碼（例如 HOP-15、PAP-123），並展開範圍（如 HOP-17~HOP-26）。
 * 僅匹配 PREFIX-數字 格式，且 prefix 與公司 issuePrefix 一致（不區分大小寫）。
 * 支援 ~ 與 ～ 兩種範圍符號。
 */
export function extractIssueIdentifiers(body: string, issuePrefix: string): string[] {
  if (!body || !issuePrefix || !issuePrefix.trim()) return [];
  const prefix = issuePrefix.trim().toUpperCase();
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const seen = new Set<string>();

  const rangeRe = new RegExp(
    `\\b(${escaped})-(\\d+)\\s*[~～]\\s*(${escaped})-(\\d+)\\b`,
    "gi",
  );
  let rangeMatch: RegExpExecArray | null;
  const rangeReCopy = new RegExp(rangeRe.source, "gi");
  while ((rangeMatch = rangeReCopy.exec(body)) !== null) {
    const a = parseInt(rangeMatch[2], 10);
    const b = parseInt(rangeMatch[4], 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let n = lo; n <= hi; n++) {
      const id = `${prefix}-${n}`;
      seen.add(id);
    }
  }

  const standaloneRe = new RegExp(`\\b${escaped}-\\d+\\b`, "gi");
  const standalones = body.match(standaloneRe) ?? [];
  for (const m of standalones) {
    seen.add(m.toUpperCase());
  }

  return [...seen].sort((x, y) => {
    const nx = parseInt(x.split("-")[1], 10);
    const ny = parseInt(y.split("-")[1], 10);
    return nx - ny;
  });
}

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

  const latestRun: LiveRunForIssue | undefined = liveRuns[0];
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
        <span className="chat-message-issue-run-card-status">
          <StatusBadge status={issue.status} />
        </span>
        <Link to={href} className="chat-message-issue-run-card-issue-link" title={issue.title ?? undefined}>
          {issue.identifier ?? issue.id.slice(0, 8)}
          {issue.title ? ` - ${issue.title}` : ""}
        </Link>
        <Link to={href} className="chat-message-issue-run-card-open" aria-label={t("dashboard.viewRun")}>
          <ExternalLink />
        </Link>
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
