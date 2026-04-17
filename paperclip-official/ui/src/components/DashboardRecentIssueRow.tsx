import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { formatRelativeTime } from "../lib/formatRelativeTime";

interface DashboardRecentIssueRowProps {
  issue: Issue;
  assigneeName: string | null;
}

/**
 * Dashboard「最近議題」單列連結（樣式沿用 dashboard-issue-link*）。
 */
export function DashboardRecentIssueRow({ issue, assigneeName }: DashboardRecentIssueRowProps) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className="dashboard-issue-link"
    >
      <div className="dashboard-issue-link-inner">
        <span className="dashboard-issue-link-status-mobile">
          <StatusIcon status={issue.status} />
        </span>
        <span className="dashboard-issue-link-content">
          <span className="dashboard-issue-link-title">{issue.title}</span>
          <span className="dashboard-issue-link-meta">
            <span className="dashboard-issue-link-meta-icon">
              <PriorityIcon priority={issue.priority} />
            </span>
            <span className="dashboard-issue-link-meta-icon">
              <StatusIcon status={issue.status} />
            </span>
            <span className="dashboard-issue-link-id">
              {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
            {assigneeName ? (
              <span className="dashboard-issue-link-meta-icon">
                <Identity name={assigneeName} size="sm" />
              </span>
            ) : null}
            <span className="dashboard-issue-link-dot-mobile">&middot;</span>
            <span className="dashboard-issue-link-time">
              {formatRelativeTime(t, issue.updatedAt)}
            </span>
          </span>
        </span>
      </div>
    </Link>
  );
}
