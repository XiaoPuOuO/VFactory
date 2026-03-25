import { Link } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { Identity } from "./Identity";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { deriveProjectUrlKey, type ActivityEvent, type Agent } from "@paperclipai/shared";

const ACTION_VERB_KEYS: Record<string, string> = {
  "issue.created": "activity.created",
  "issue.updated": "activity.updated",
  "issue.checked_out": "activity.checkedOut",
  "issue.released": "activity.released",
  "issue.comment_added": "activity.commentedOn",
  "issue.attachment_added": "activity.attachedFileTo",
  "issue.attachment_removed": "activity.removedAttachmentFrom",
  "issue.commented": "activity.commentedOn",
  "issue.deleted": "activity.deleted",
  "agent.created": "activity.created",
  "agent.updated": "activity.updated",
  "agent.paused": "activity.paused",
  "agent.resumed": "activity.resumed",
  "agent.terminated": "activity.terminated",
  "agent.key_created": "activity.createdApiKeyFor",
  "agent.budget_updated": "activity.updatedBudgetFor",
  "agent.runtime_session_reset": "activity.resetSessionFor",
  "heartbeat.invoked": "activity.invokedHeartbeatFor",
  "heartbeat.cancelled": "activity.cancelledHeartbeatFor",
  "approval.created": "activity.requestedApproval",
  "approval.approved": "activity.approved",
  "approval.rejected": "activity.rejected",
  "project.created": "activity.created",
  "project.updated": "activity.updated",
  "project.deleted": "activity.deleted",
  "goal.created": "activity.created",
  "goal.updated": "activity.updated",
  "goal.deleted": "activity.deleted",
  "cost.reported": "activity.reportedCostFor",
  "cost.recorded": "activity.recordedCostFor",
  "company.created": "activity.createdCompany",
  "company.updated": "activity.updatedCompany",
  "company.archived": "activity.archived",
  "company.budget_updated": "activity.updatedBudgetFor",
  "company.budget_policy_created": "activity.createdBudgetPolicy",
  "company.budget_policy_updated": "activity.updatedBudgetPolicy",
  "company.budget_policy_deleted": "activity.deletedBudgetPolicy",
};

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function formatVerb(
  t: (key: string, opts?: Record<string, unknown>) => string,
  action: string,
  details?: Record<string, unknown> | null
): string {
  if (action === "issue.updated" && details) {
    const previous = (details._previous ?? {}) as Record<string, unknown>;
    if (details.status !== undefined) {
      const from = previous.status;
      return from
        ? t("activity.changedStatusFromToOn", { from: humanizeValue(from), to: humanizeValue(details.status) })
        : t("activity.changedStatusToOn", { status: humanizeValue(details.status) });
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      return from
        ? t("activity.changedPriorityFromToOn", { from: humanizeValue(from), to: humanizeValue(details.priority) })
        : t("activity.changedPriorityToOn", { priority: humanizeValue(details.priority) });
    }
  }
  const key = ACTION_VERB_KEYS[action];
  return key ? t(key) : action.replace(/[._]/g, " ");
}

function entityLink(entityType: string, entityId: string, name?: string | null): string | null {
  switch (entityType) {
    case "issue": return `/issues/${name ?? entityId}`;
    case "agent": return `/agents/${entityId}`;
    case "project": return `/projects/${deriveProjectUrlKey(name, entityId)}`;
    case "goal": return `/goals/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

interface ActivityRowProps {
  event: ActivityEvent;
  agentMap: Map<string, Agent>;
  entityNameMap: Map<string, string>;
  entityTitleMap?: Map<string, string>;
  className?: string;
}

export function ActivityRow({ event, agentMap, entityNameMap, entityTitleMap, className }: ActivityRowProps) {
  const { t } = useTranslation();
  const verb = formatVerb(t, event.action, event.details);

  const isHeartbeatEvent = event.entityType === "heartbeat_run";
  const heartbeatAgentId = isHeartbeatEvent
    ? (event.details as Record<string, unknown> | null)?.agentId as string | undefined
    : undefined;

  const name = isHeartbeatEvent
    ? (heartbeatAgentId ? entityNameMap.get(`agent:${heartbeatAgentId}`) : null)
    : entityNameMap.get(`${event.entityType}:${event.entityId}`);

  const entityTitle = entityTitleMap?.get(`${event.entityType}:${event.entityId}`);

  const link = isHeartbeatEvent && heartbeatAgentId
    ? `/agents/${heartbeatAgentId}/runs/${event.entityId}`
    : entityLink(event.entityType, event.entityId, name);

  const actor = event.actorType === "agent" ? agentMap.get(event.actorId) : null;
  const actorName = actor?.name ?? (event.actorType === "system" ? t("activity.system") : event.actorType === "user" ? t("activity.board") : event.actorId || t("activity.unknown"));

  const inner = (
    <>
      <p className="dashboard-activity-row-body">
        <Identity name={actorName} size="xs" className="activity-row-identity-baseline" />
        <span className="dashboard-activity-row-verb">{verb} </span>
        {name && <span className="dashboard-activity-row-name">{name}</span>}
        {entityTitle && <span className="dashboard-activity-row-verb">— {entityTitle}</span>}
      </p>
      <span className="dashboard-activity-row-time">{formatRelativeTime(t, event.createdAt)}</span>
    </>
  );

  const rowClasses = ["dashboard-activity-row", link && "link", className].filter(Boolean).join(" ");

  if (link) {
    return (
      <Link to={link} className={rowClasses}>
        {inner}
      </Link>
    );
  }

  return <div className={rowClasses}>{inner}</div>;
}
