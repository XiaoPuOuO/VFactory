import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { ChevronDown, Trash2, X } from "lucide-react";

const statusOrder = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

interface Agent {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

interface IssuesBulkBarProps {
  selectedCount: number;
  agents?: Agent[];
  projects?: Project[];
  busy?: boolean;
  onSetStatus: (status: string) => void | Promise<void>;
  onSetPriority: (priority: string) => void | Promise<void>;
  onSetAssignee: (assigneeAgentId: string | null) => void | Promise<void>;
  onSetProject: (projectId: string | null) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onClear: () => void;
}

export function IssuesBulkBar({
  selectedCount,
  agents,
  projects,
  busy,
  onSetStatus,
  onSetPriority,
  onSetAssignee,
  onSetProject,
  onDelete: onDeleteProp,
  onClear,
}: IssuesBulkBarProps) {
  const { t } = useTranslation();

  if (selectedCount < 1) return null;

  const statusLabel = (status: string) =>
    t(`status.${status === "in_progress" ? "inProgress" : status === "in_review" ? "inReview" : status}`, {
      defaultValue: status.replace(/_/g, " "),
    });

  const PRIORITY_KEYS: Record<string, string> = {
    critical: "dashboard.priorityCritical",
    high: "dashboard.priorityHigh",
    medium: "dashboard.priorityMedium",
    low: "dashboard.priorityLow",
  };
  const priorityLabel = (priority: string) =>
    PRIORITY_KEYS[priority] ? t(PRIORITY_KEYS[priority]) : priority;

  return (
    <div className="issues-bulk-bar" role="toolbar" aria-label={t("issuesList.bulkToolbarAria")}>
      <span className="issues-bulk-count">{t("issuesList.bulkSelected", { count: selectedCount })}</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="issues-bulk-btn" disabled={busy}>
            {t("issuesList.bulkStatus")}
            <ChevronDown className="issues-bulk-chevron" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="issues-popover-menu issues-bulk-popover">
          <div className="issues-popover-menu-inner">
            {statusOrder.map((s) => (
              <button
                key={s}
                type="button"
                className="issues-popover-menu-btn"
                onClick={() => void onSetStatus(s)}
              >
                <StatusIcon status={s} />
                <span>{statusLabel(s)}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="issues-bulk-btn" disabled={busy}>
            {t("issuesList.bulkPriority")}
            <ChevronDown className="issues-bulk-chevron" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="issues-popover-menu issues-bulk-popover">
          <div className="issues-popover-menu-inner">
            {priorityOrder.map((p) => (
              <button
                key={p}
                type="button"
                className="issues-popover-menu-btn"
                onClick={() => void onSetPriority(p)}
              >
                <PriorityIcon priority={p} />
                <span>{priorityLabel(p)}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="issues-bulk-btn" disabled={busy}>
            {t("issuesList.bulkAssignee")}
            <ChevronDown className="issues-bulk-chevron" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="issues-popover-menu issues-bulk-popover">
          <div className="issues-popover-menu-inner">
            <button type="button" className="issues-popover-menu-btn" onClick={() => void onSetAssignee(null)}>
              {t("issuesList.bulkNoAssignee")}
            </button>
            {(agents ?? []).map((a) => (
              <button key={a.id} type="button" className="issues-popover-menu-btn" onClick={() => void onSetAssignee(a.id)}>
                <Identity name={a.name} size="sm" className="issues-identity-min-w-0" />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="issues-bulk-btn" disabled={busy}>
            {t("issuesList.bulkProject")}
            <ChevronDown className="issues-bulk-chevron" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="issues-popover-menu issues-bulk-popover">
          <div className="issues-popover-menu-inner">
            <button type="button" className="issues-popover-menu-btn" onClick={() => void onSetProject(null)}>
              {t("issuesList.bulkNoProject")}
            </button>
            {(projects ?? []).map((p) => (
              <button key={p.id} type="button" className="issues-popover-menu-btn" onClick={() => void onSetProject(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {onDeleteProp ? (
        <Button type="button" variant="destructive" size="sm" className="issues-bulk-btn" disabled={busy} onClick={() => void onDeleteProp()}>
          <Trash2 className="issues-bulk-icon" />
          {t("issuesList.bulkDelete")}
        </Button>
      ) : null}

      <Button type="button" variant="ghost" size="sm" className="issues-bulk-btn" disabled={busy} onClick={onClear} aria-label={t("issuesList.bulkClear")}>
        <X className="issues-bulk-icon" />
      </Button>
    </div>
  );
}
