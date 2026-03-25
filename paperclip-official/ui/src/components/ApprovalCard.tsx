import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Identity } from "./Identity";
import { typeLabel, typeIcon, defaultTypeIcon, ApprovalPayloadRenderer } from "./ApprovalPayload";
import { timeAgo } from "../lib/timeAgo";
import type { Approval, Agent } from "@paperclipai/shared";

function statusIcon(status: string) {
  const base = "ui-approval-card-status-icon";
  if (status === "approved") return <CheckCircle2 className={`${base} approved`} />;
  if (status === "rejected") return <XCircle className={`${base} rejected`} />;
  if (status === "revision_requested") return <Clock className={`${base} revision`} />;
  if (status === "pending") return <Clock className={`${base} pending`} />;
  return null;
}

export function ApprovalCard({
  approval,
  requesterAgent,
  onApprove,
  onReject,
  onOpen,
  detailLink,
  isPending,
}: {
  approval: Approval;
  requesterAgent: Agent | null;
  onApprove: () => void;
  onReject: () => void;
  onOpen?: () => void;
  detailLink?: string;
  isPending: boolean;
}) {
  const Icon = typeIcon[approval.type] ?? defaultTypeIcon;
  const label = typeLabel[approval.type] ?? approval.type;

  return (
    <div className="ui-approval-card">
      <div className="ui-approval-card-header">
        <div className="ui-approval-card-header-left">
          <Icon className="ui-approval-card-type-icon" />
          <div className="ui-approval-card-header-title-wrap">
            <span className="ui-approval-card-label">{label}</span>
            {requesterAgent && (
              <span className="ui-approval-card-meta">
                requested by <Identity name={requesterAgent.name} size="sm" className="ui-approval-card-identity-inline" />
              </span>
            )}
          </div>
        </div>
        <div className="ui-approval-card-header-right">
          {statusIcon(approval.status)}
          <span className="ui-approval-card-meta ui-approval-card-status-text">{approval.status}</span>
          {approval.status === "approved" && approval.decisionSource === "policy" && (
            <span className="ui-approval-card-decision-source" title="Policy auto-approved">
              policy
            </span>
          )}
          <span className="ui-approval-card-meta">· {timeAgo(approval.createdAt)}</span>
        </div>
      </div>

      <ApprovalPayloadRenderer type={approval.type} payload={approval.payload} />

      {approval.decisionNote && (
        <div className="ui-approval-card-decision-note">
          Note: {approval.decisionNote}
        </div>
      )}

      {(approval.status === "pending" || approval.status === "revision_requested") && (
        <div className="ui-approval-card-actions">
          <Button
            size="sm"
            className="ui-approval-card-approve-btn"
            onClick={onApprove}
            disabled={isPending}
          >
            Approve
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onReject}
            disabled={isPending}
          >
            Reject
          </Button>
        </div>
      )}
      <div className="ui-approval-card-detail-wrap">
        {detailLink ? (
          <Button variant="ghost" size="sm" className="ui-approval-card-detail-btn" asChild>
            <Link to={detailLink}>View details</Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="ui-approval-card-detail-btn" onClick={onOpen}>
            View details
          </Button>
        )}
      </div>
    </div>
  );
}
