import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Check, Copy, Paperclip } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { AgentIcon } from "./AgentIconPicker";
import { formatDateTime } from "../lib/utils";
import "./CommentThread.css";

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  mentions?: MentionOption[];
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DRAFT_DEBOUNCE_MS = 800;

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

/** 複製 Markdown 按鈕，hover 後才顯示 */
function CopyMarkdownButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="comment-card-copy-btn"
      title="Copy as markdown"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  highlightCommentId,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  highlightCommentId?: string | null;
}) {
  if (timeline.length === 0) {
    return <p className="comment-timeline-empty">No comments or runs yet.</p>;
  }

  return (
    <div className="comment-timeline">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          return (
            <div key={`run:${run.runId}`} className="comment-run-card">
              <div className="comment-run-card-header">
                <Link to={`/agents/${run.agentId}`} className="comment-card-author-link">
                  <Identity
                    name={agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
                <span className="comment-run-card-time">
                  {formatDateTime(run.startedAt ?? run.createdAt)}
                </span>
              </div>
              <div className="comment-run-card-body">
                <span className="comment-run-label">Run</span>
                <Link
                  to={`/agents/${run.agentId}/runs/${run.runId}`}
                  className="comment-run-id-link"
                >
                  {run.runId.slice(0, 8)}
                </Link>
                <StatusBadge status={run.status} />
              </div>
            </div>
          );
        }

        const comment = item.comment;
        const isHighlighted = highlightCommentId === comment.id;
        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={["comment-card", isHighlighted ? "highlighted" : ""].filter(Boolean).join(" ")}
          >
            <div className="comment-card-header">
              {comment.authorAgentId ? (
                <Link to={`/agents/${comment.authorAgentId}`} className="comment-card-author-link">
                  <Identity
                    name={agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
              ) : (
                <Identity name="You" size="sm" />
              )}
              <span className="comment-card-meta">
                <a
                  href={`#comment-${comment.id}`}
                  className="comment-card-time"
                >
                  {formatDateTime(comment.createdAt)}
                </a>
                <CopyMarkdownButton text={comment.body} />
              </span>
            </div>
            <div className="comment-card-body">
              <MarkdownBody>{comment.body}</MarkdownBody>
            </div>
            {comment.runId && (
              <div className="comment-card-run-footer">
                {comment.runAgentId ? (
                  <Link
                    to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
                    className="comment-card-run-link"
                  >
                    run {comment.runId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="comment-card-run-span">
                    run {comment.runId.slice(0, 8)}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  onAdd,
  issueStatus,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  mentions: providedMentions,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(currentAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const isClosed = issueStatus ? CLOSED_STATUSES.has(issueStatus) : false;

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [comments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: a.id,
        name: a.name,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(currentAssigneeValue);
  }, [currentAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, isClosed && reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(false);
      setReassignTarget(currentAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file || !onAttachImage) return;
    setAttaching(true);
    try {
      await onAttachImage(file);
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="comment-thread">
      {/* 標頭：Comments & Runs (n) */}
      <div className="comment-thread-header">
        <span className="comment-thread-title">Comments & Runs</span>
        <span className="comment-thread-count">{timeline.length}</span>
      </div>

      <TimelineList timeline={timeline} agentMap={agentMap} highlightCommentId={highlightCommentId} />

      {liveRunSlot}

      {/* 留言輸入框 */}
      <div className="comment-composer">
        <div className="comment-composer-editor">
          <MarkdownEditor
            ref={editorRef}
            value={body}
            onChange={setBody}
            placeholder="Leave a comment..."
            mentions={mentions}
            onSubmit={handleSubmit}
            imageUploadHandler={imageUploadHandler}
            contentClassName="min-h-[60px] text-sm"
          />
        </div>
        <div className="comment-composer-footer">
          <div className="comment-composer-left">
            {onAttachImage && (
              <>
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="comment-card-copy-btn"
                  style={{ display: "none" }}
                  onChange={handleAttachFile}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => attachInputRef.current?.click()}
                  disabled={attaching}
                  title="Attach image"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </>
            )}
            {isClosed && (
              <label className="comment-composer-reopen">
                <input
                  type="checkbox"
                  checked={reopen}
                  onChange={(e) => setReopen(e.target.checked)}
                />
                Re-open
              </label>
            )}
          </div>
          {enableReassign && reassignOptions.length > 0 && (
            <InlineEntitySelector
              value={reassignTarget}
              options={reassignOptions}
              placeholder="Assignee"
              noneLabel="No assignee"
              searchPlaceholder="Search assignees..."
              emptyMessage="No assignees found."
              onChange={setReassignTarget}
              className="text-xs h-8"
              renderTriggerValue={(option) => {
                if (!option) return <span className="comment-run-label">Assignee</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
              renderOption={(option) => {
                if (!option.id) return <span className="truncate">{option.label}</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
            />
          )}
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
