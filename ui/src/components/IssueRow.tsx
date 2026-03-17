import type { ReactNode } from "react";
import type { Issue } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { PriorityIcon } from "./PriorityIcon";
import { StatusIcon } from "./StatusIcon";

type UnreadState = "hidden" | "visible" | "fading";

interface IssueRowProps {
  issue: Issue;
  issueLinkState?: unknown;
  mobileLeading?: ReactNode;
  desktopMetaLeading?: ReactNode;
  desktopLeadingSpacer?: boolean;
  mobileMeta?: ReactNode;
  desktopTrailing?: ReactNode;
  trailingMeta?: ReactNode;
  unreadState?: UnreadState | null;
  onMarkRead?: () => void;
  className?: string;
}

export function IssueRow({
  issue,
  issueLinkState,
  mobileLeading,
  desktopMetaLeading,
  desktopLeadingSpacer = false,
  mobileMeta,
  desktopTrailing,
  trailingMeta,
  unreadState = null,
  onMarkRead,
  className,
}: IssueRowProps) {
  const issuePathId = issue.identifier ?? issue.id;
  const identifier = issue.identifier ?? issue.id.slice(0, 8);
  const showUnreadSlot = unreadState !== null;
  const showUnreadDot = unreadState === "visible" || unreadState === "fading";

  return (
    <Link
      to={`/issues/${issuePathId}`}
      state={issueLinkState}
      className={["issues-row", className].filter(Boolean).join(" ")}
    >
      <span className="issues-row-mobile-lead">
        {mobileLeading ?? <StatusIcon status={issue.status} />}
      </span>
      <span className="issues-row-content">
        <span className="issues-row-title">
          {issue.title}
          {issue.executionLabel && (
            <span className="issues-row-title-tag">[{issue.executionLabel}]</span>
          )}
        </span>
        <span className="issues-row-meta">
          {desktopLeadingSpacer ? (
            <span className="issues-row-meta-icon" style={{ width: 14, visibility: "hidden" }} aria-hidden />
          ) : null}
          {desktopMetaLeading ?? (
            <>
              <span className="issues-row-meta-icon">
                <PriorityIcon priority={issue.priority} />
              </span>
              <span className="issues-row-meta-icon">
                <StatusIcon status={issue.status} />
              </span>
              <span className="issues-row-id">{identifier}</span>
            </>
          )}
          {mobileMeta ? (
            <>
              <span className="issues-row-dot" aria-hidden="true">&middot;</span>
              <span className="issues-row-meta-mobile">{mobileMeta}</span>
            </>
          ) : null}
        </span>
      </span>
      {(desktopTrailing || trailingMeta) ? (
        <span className="issues-row-trailing">
          {desktopTrailing}
          {trailingMeta ? (
            <span className="issues-row-trailing-meta">{trailingMeta}</span>
          ) : null}
        </span>
      ) : null}
      {showUnreadSlot ? (
        <span className="issues-row-unread-slot">
          {showUnreadDot ? (
            <button
              type="button"
              className="issues-row-unread-btn"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onMarkRead?.();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onMarkRead?.();
                }
              }}
              aria-label="Mark as read"
            >
              <span
                className={["issues-row-unread-dot", unreadState === "fading" && "fading"].filter(Boolean).join(" ")}
              />
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
        </span>
      ) : null}
    </Link>
  );
}
