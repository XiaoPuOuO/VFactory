import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import type { Issue } from "@paperclipai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { authApi, isAuthSession } from "../api/auth";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { formatDate, projectUrl } from "../lib/utils";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Hexagon, ArrowUpRight, Tag, Plus, Trash2 } from "lucide-react";
import { AgentIcon } from "./AgentIconPicker";

// TODO(issue-worktree-support): re-enable this UI once the workflow is ready to ship.
const SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI = false;

interface IssuePropertiesProps {
  issue: Issue;
  onUpdate: (data: Record<string, unknown>) => void;
  inline?: boolean;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ui-properties-row">
      <span className="ui-properties-label">{label}</span>
      <div className="ui-properties-value ui-properties-value-flex1">{children}</div>
    </div>
  );
}

/** Renders a Popover on desktop, or an inline collapsible section on mobile (inline mode). */
function PropertyPicker({
  inline,
  label,
  open,
  onOpenChange,
  triggerContent,
  triggerClassName,
  popoverClassName,
  popoverAlign = "end",
  extra,
  children,
}: {
  inline?: boolean;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerContent: React.ReactNode;
  triggerClassName?: string;
  popoverClassName?: string;
  popoverAlign?: "start" | "center" | "end";
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const triggerClass = ["ui-properties-picker-trigger-inline", triggerClassName].filter(Boolean).join(" ");

  if (inline) {
    return (
      <div>
        <PropertyRow label={label}>
          <button type="button" className={triggerClass} onClick={() => onOpenChange(!open)}>
            {triggerContent}
          </button>
          {extra}
        </PropertyRow>
        {open && (
          <div className={["ui-properties-picker-inline-panel", popoverClassName].filter(Boolean).join(" ")}>
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className={triggerClass}>{triggerContent}</button>
        </PopoverTrigger>
        <PopoverContent className={["ui-properties-picker-content-pad", popoverClassName].filter(Boolean).join(" ")} align={popoverAlign} collisionPadding={16}>
          {children}
        </PopoverContent>
      </Popover>
      {extra}
    </PropertyRow>
  );
}

export function IssueProperties({ issue, onUpdate, inline }: IssuePropertiesProps) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const companyId = issue.companyId ?? selectedCompanyId;
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = isAuthSession(session) ? session.user?.id ?? session.session?.userId : undefined;

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId!),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(companyId!),
    queryFn: () => projectsApi.list(companyId!),
    enabled: !!companyId,
  });
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId,
    userId: currentUserId,
  });

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(companyId!),
    queryFn: () => issuesApi.listLabels(companyId!),
    enabled: !!companyId,
  });

  const createLabel = useMutation({
    mutationFn: (data: { name: string; color: string }) => issuesApi.createLabel(companyId!, data),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      onUpdate({ labelIds: [...(issue.labelIds ?? []), created.id] });
      setNewLabelName("");
    },
  });

  const deleteLabel = useMutation({
    mutationFn: (labelId: string) => issuesApi.deleteLabel(labelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.labels(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) });
    },
  });

  const toggleLabel = (labelId: string) => {
    const ids = issue.labelIds ?? [];
    const next = ids.includes(labelId)
      ? ids.filter((id) => id !== labelId)
      : [...ids, labelId];
    onUpdate({ labelIds: next });
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    const agent = agents.find((a) => a.id === id);
    return agent?.name ?? id.slice(0, 8);
  };

  const projectName = (id: string | null) => {
    if (!id) return id?.slice(0, 8) ?? "None";
    const project = orderedProjects.find((p) => p.id === id);
    return project?.name ?? id.slice(0, 8);
  };
  const currentProject = issue.projectId
    ? orderedProjects.find((project) => project.id === issue.projectId) ?? null
    : null;
  const currentProjectExecutionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
    ? currentProject?.executionWorkspacePolicy ?? null
    : null;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);
  const usesIsolatedExecutionWorkspace = issue.executionWorkspaceSettings?.mode === "isolated"
    ? true
    : issue.executionWorkspaceSettings?.mode === "project_primary"
      ? false
      : currentProjectExecutionWorkspacePolicy?.defaultMode === "isolated";
  const projectLink = (id: string | null) => {
    if (!id) return null;
    const project = projects?.find((p) => p.id === id) ?? null;
    return project ? projectUrl(project) : `/projects/${id}`;
  };

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [assigneeOpen]);
  const sortedAgents = useMemo(
    () => sortAgentsByRecency((agents ?? []).filter((a) => a.status !== "terminated"), recentAssigneeIds),
    [agents, recentAssigneeIds],
  );

  const assignee = issue.assigneeAgentId
    ? agents?.find((a) => a.id === issue.assigneeAgentId)
    : null;
  const userLabel = (userId: string | null | undefined) =>
    userId
      ? userId === "local-board"
        ? t("properties.board")
        : currentUserId && userId === currentUserId
          ? t("properties.me")
          : userId.slice(0, 5)
      : null;
  const assigneeUserLabel = userLabel(issue.assigneeUserId);
  const creatorUserLabel = userLabel(issue.createdByUserId);

  const labelsTrigger = (issue.labels ?? []).length > 0 ? (
    <div className="ui-issue-props-chips">
      {(issue.labels ?? []).slice(0, 3).map((label) => (
        <span
          key={label.id}
          className="ui-issue-props-chip"
          style={{
            borderColor: label.color,
            backgroundColor: `${label.color}22`,
            color: label.color,
          }}
        >
          {label.name}
        </span>
      ))}
      {(issue.labels ?? []).length > 3 && (
        <span className="ui-issue-props-muted-sm">+{(issue.labels ?? []).length - 3}</span>
      )}
    </div>
  ) : (
    <>
      <Tag className="ui-issue-props-icon-sm" />
      <span className="ui-issue-props-empty">{t("properties.noLabels")}</span>
    </>
  );

  const labelsContent = (
    <>
      <input
        className="ui-issue-props-search"
        placeholder={t("properties.searchLabels")}
        value={labelSearch}
        onChange={(e) => setLabelSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="ui-issue-props-list">
        {(labels ?? [])
          .filter((label) => {
            if (!labelSearch.trim()) return true;
            return label.name.toLowerCase().includes(labelSearch.toLowerCase());
          })
          .map((label) => {
            const selected = (issue.labelIds ?? []).includes(label.id);
            return (
              <div key={label.id} className="ui-issue-props-option">
                <button
                  type="button"
                  className={["ui-form-dialog-popover-item", "ui-issue-props-option-btn", selected ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => toggleLabel(label.id)}
                >
                  <span className="ui-issue-props-chip-dot" style={{ backgroundColor: label.color }} />
                  <span className="ui-issue-props-trigger-inner">{label.name}</span>
                </button>
                <button
                  type="button"
                  className="ui-issue-props-chip-remove"
                  onClick={() => deleteLabel.mutate(label.id)}
                  title={t("properties.deleteLabel", { name: label.name })}
                >
                  <Trash2 className="ui-issue-props-icon-xs" />
                </button>
              </div>
            );
          })}
      </div>
      <div className="ui-issue-props-add-section">
        <div className="ui-issue-props-add-row">
          <input
            className="ui-issue-props-color-btn"
            type="color"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
          />
          <input
            className="ui-issue-props-add-input"
            placeholder={t("properties.newLabel")}
            value={newLabelName}
            onChange={(e) => setNewLabelName(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="ui-issue-props-add-btn"
          disabled={!newLabelName.trim() || createLabel.isPending}
          onClick={() =>
            createLabel.mutate({
              name: newLabelName.trim(),
              color: newLabelColor,
            })
          }
        >
          <Plus className="ui-issue-props-icon-xs" />
          {createLabel.isPending ? t("properties.creating") : t("properties.createLabel")}
        </button>
      </div>
    </>
  );

  const assigneeTrigger = assignee ? (
    <Identity name={assignee.name} size="sm" />
  ) : assigneeUserLabel ? (
    <>
      <User className="ui-issue-props-icon-sm" />
      <span className="ui-issue-props-text">{assigneeUserLabel}</span>
    </>
  ) : (
    <>
      <User className="ui-issue-props-icon-sm" />
      <span className="ui-issue-props-empty">{t("properties.unassigned")}</span>
    </>
  );

  const assigneeContent = (
    <>
      <input
        className="ui-issue-props-search"
        placeholder={t("properties.searchAssignees")}
        value={assigneeSearch}
        onChange={(e) => setAssigneeSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="ui-issue-props-list ui-issue-props-list-tall">
        <button
          type="button"
          className={["ui-form-dialog-popover-item", !issue.assigneeAgentId && !issue.assigneeUserId ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => { onUpdate({ assigneeAgentId: null, assigneeUserId: null }); setAssigneeOpen(false); }}
        >
          {t("properties.noAssignee")}
        </button>
        {issue.createdByUserId && (
          <button
            type="button"
            className={["ui-form-dialog-popover-item", issue.assigneeUserId === issue.createdByUserId ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              onUpdate({ assigneeAgentId: null, assigneeUserId: issue.createdByUserId });
              setAssigneeOpen(false);
            }}
          >
            <User className="ui-issue-props-icon-xs" />
            {creatorUserLabel ? (creatorUserLabel === t("properties.me") ? t("properties.assignToMe") : t("properties.assignTo", { name: creatorUserLabel })) : t("properties.assignToRequester")}
          </button>
        )}
        {sortedAgents
          .filter((a) => {
            if (!assigneeSearch.trim()) return true;
            const q = assigneeSearch.toLowerCase();
            return a.name.toLowerCase().includes(q);
          })
          .map((a) => (
          <button
            key={a.id}
            type="button"
            className={["ui-form-dialog-popover-item", a.id === issue.assigneeAgentId ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => { trackRecentAssignee(a.id); onUpdate({ assigneeAgentId: a.id, assigneeUserId: null }); setAssigneeOpen(false); }}
          >
            <AgentIcon icon={a.icon} className="ui-issue-props-icon-xs" />
            {a.name}
          </button>
        ))}
      </div>
    </>
  );

  const projectTrigger = issue.projectId ? (
    <>
      <span
        className="ui-issue-props-project-color"
        style={{ backgroundColor: orderedProjects.find((p) => p.id === issue.projectId)?.color ?? "#6366f1" }}
      />
      <span className="ui-issue-props-text ui-issue-props-trigger-inner">{projectName(issue.projectId)}</span>
    </>
  ) : (
    <>
      <Hexagon className="ui-issue-props-icon-sm" />
      <span className="ui-issue-props-empty">{t("properties.noProject")}</span>
    </>
  );

  const projectContent = (
    <>
      <input
        className="ui-issue-props-search"
        placeholder={t("properties.searchProjects")}
        value={projectSearch}
        onChange={(e) => setProjectSearch(e.target.value)}
        autoFocus={!inline}
      />
      <div className="ui-issue-props-list ui-issue-props-list-tall">
        <button
          type="button"
          className={["ui-form-dialog-popover-item", "ui-issue-props-nowrap", !issue.projectId ? "active" : ""].filter(Boolean).join(" ")}
          onClick={() => { onUpdate({ projectId: null }); setProjectOpen(false); }}
        >
          {t("properties.noProject")}
        </button>
        {orderedProjects
          .filter((p) => {
            if (!projectSearch.trim()) return true;
            const q = projectSearch.toLowerCase();
            return p.name.toLowerCase().includes(q);
          })
          .map((p) => (
          <button
            key={p.id}
            type="button"
            className={["ui-form-dialog-popover-item", "ui-issue-props-nowrap", p.id === issue.projectId ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              onUpdate({
                projectId: p.id,
                executionWorkspaceSettings: SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI && p.executionWorkspacePolicy?.enabled
                  ? { mode: p.executionWorkspacePolicy.defaultMode === "isolated" ? "isolated" : "project_primary" }
                  : null,
              });
              setProjectOpen(false);
            }}
          >
            <span
              className="ui-issue-props-project-color"
              style={{ backgroundColor: p.color ?? "#6366f1" }}
            />
            {p.name}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="ui-properties">
      <div className="ui-properties-section">
        <PropertyRow label={t("properties.status")}>
          <StatusIcon
            status={issue.status}
            onChange={(status) => onUpdate({ status })}
            showLabel
          />
        </PropertyRow>

        <PropertyRow label={t("properties.priority")}>
          <PriorityIcon
            priority={issue.priority}
            onChange={(priority) => onUpdate({ priority })}
            showLabel
          />
        </PropertyRow>

        <PropertyPicker
          inline={inline}
          label={t("properties.labels")}
          open={labelsOpen}
          onOpenChange={(open) => { setLabelsOpen(open); if (!open) setLabelSearch(""); }}
          triggerContent={labelsTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-64"
        >
          {labelsContent}
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label={t("properties.assignee")}
          open={assigneeOpen}
          onOpenChange={(open) => { setAssigneeOpen(open); if (!open) setAssigneeSearch(""); }}
          triggerContent={assigneeTrigger}
          popoverClassName="w-52"
          extra={issue.assigneeAgentId ? (
            <Link
              to={`/agents/${issue.assigneeAgentId}`}
              className="ui-issue-props-action-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="ui-issue-props-icon-xs" />
            </Link>
          ) : undefined}
        >
          {assigneeContent}
        </PropertyPicker>

        <PropertyPicker
          inline={inline}
          label={t("properties.project")}
          open={projectOpen}
          onOpenChange={(open) => { setProjectOpen(open); if (!open) setProjectSearch(""); }}
          triggerContent={projectTrigger}
          triggerClassName="min-w-0 max-w-full"
          popoverClassName="w-fit min-w-[11rem]"
          extra={issue.projectId ? (
            <Link
              to={projectLink(issue.projectId)!}
              className="ui-issue-props-action-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight className="ui-issue-props-icon-xs" />
            </Link>
          ) : undefined}
        >
          {projectContent}
        </PropertyPicker>

        {currentProjectSupportsExecutionWorkspace && (
          <PropertyRow label={t("properties.workspace")}>
            <div className="ui-issue-props-card">
              <div className="ui-issue-props-card-body">
                <div className="ui-issue-props-card-title">
                  {usesIsolatedExecutionWorkspace ? t("properties.isolatedCheckout") : t("properties.projectPrimaryCheckout")}
                </div>
                <div className="ui-issue-props-card-meta">
                  {t("properties.workspaceToggleHint")}
                </div>
              </div>
              <button
                type="button"
                className={["ui-new-issue-toggle", usesIsolatedExecutionWorkspace ? "on" : ""].filter(Boolean).join(" ")}
                onClick={() =>
                  onUpdate({
                    executionWorkspaceSettings: {
                      mode: usesIsolatedExecutionWorkspace ? "project_primary" : "isolated",
                    },
                  })
                }
              >
                <span className="ui-new-issue-toggle-thumb" />
              </button>
            </div>
          </PropertyRow>
        )}

        <PropertyRow label={t("properties.executionLabel")}>
          <input
            type="text"
            className="ui-issue-props-add-input ui-issue-props-add-input-full"
            placeholder={t("properties.executionLabelPlaceholder")}
            maxLength={64}
            value={issue.executionLabel ?? ""}
            onChange={(e) =>
              onUpdate({
                executionLabel: e.target.value.trim() || null,
              })
            }
          />
        </PropertyRow>
        <PropertyRow label={t("properties.subtaskExecution")}>
          <select
            className="ui-issue-props-select"
            value={issue.executionPolicy?.subtaskExecutionPolicy ?? "parallel"}
            onChange={(e) =>
              onUpdate({
                executionPolicy: {
                  ...(issue.executionPolicy ?? {}),
                  subtaskExecutionPolicy: e.target.value as "parallel" | "sequential" | "phased",
                },
              })
            }
          >
            <option value="parallel">{t("properties.parallel")} {t("properties.parallelForChildTasks")}</option>
            <option value="sequential">{t("properties.sequential")}</option>
            <option value="phased">{t("properties.phased")}</option>
          </select>
          <span className="ui-issue-props-muted-sm ui-issue-props-ml-1">{t("properties.parallelForChildTasks")}</span>
        </PropertyRow>

        {issue.parentId && (
          <PropertyRow label="Parent">
            <Link
              to={`/issues/${issue.ancestors?.[0]?.identifier ?? issue.parentId}`}
              className="ui-issue-props-link"
            >
              {issue.ancestors?.[0]?.title ?? issue.parentId.slice(0, 8)}
            </Link>
          </PropertyRow>
        )}

        {issue.requestDepth > 0 && (
          <PropertyRow label="Depth">
            <span className="ui-issue-props-text ui-issue-props-text-mono">{issue.requestDepth}</span>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <div className="ui-properties-section">
        {(issue.createdByAgentId || issue.createdByUserId) && (
          <PropertyRow label={t("properties.createdBy")}>
            {issue.createdByAgentId ? (
              <Link
                to={`/agents/${issue.createdByAgentId}`}
                className="ui-issue-props-link"
              >
                <Identity name={agentName(issue.createdByAgentId) ?? issue.createdByAgentId.slice(0, 8)} size="sm" />
              </Link>
            ) : (
              <>
                <User className="ui-issue-props-icon-sm" />
                <span className="ui-issue-props-text">{creatorUserLabel ?? "User"}</span>
              </>
            )}
          </PropertyRow>
        )}
        {issue.startedAt && (
          <PropertyRow label={t("properties.started")}>
            <span className="ui-issue-props-text">{formatDate(issue.startedAt)}</span>
          </PropertyRow>
        )}
        {issue.completedAt && (
          <PropertyRow label={t("properties.completed")}>
            <span className="ui-issue-props-text">{formatDate(issue.completedAt)}</span>
          </PropertyRow>
        )}
        <PropertyRow label={t("properties.created")}>
          <span className="ui-issue-props-text">{formatDate(issue.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label={t("properties.updated")}>
          <span className="ui-issue-props-text">{formatRelativeTime(t, issue.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
