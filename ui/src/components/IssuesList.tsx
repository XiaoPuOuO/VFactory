import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { pruneSelectionToVisible, selectionSetsEqual } from "../lib/issues-list-selection";
import { groupBy } from "../lib/groupBy";
import { formatDate } from "../lib/utils";
import { timeAgo } from "../lib/timeAgo";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { EmptyState } from "./EmptyState";
import { Identity } from "./Identity";
import { IssueRow } from "./IssueRow";
import { IssuesBulkBar } from "./IssuesBulkBar";
import { IssuesSavedViewsMenu } from "./IssuesSavedViewsMenu";
import { PageSkeleton } from "./PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CircleDot, Plus, Filter, ArrowUpDown, Layers, Check, X, ChevronRight, List, Columns3, User, Search } from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import type { Issue } from "@paperclipai/shared";
import { EMPTY_ISSUE_LIST } from "../lib/emptyCollections";

import "../styles/issues-list.css";

/* ── Helpers ── */

const statusOrder = ["in_progress", "todo", "backlog", "in_review", "blocked", "done", "cancelled"];
const priorityOrder = ["critical", "high", "medium", "low"];

const STATUS_KEYS: Record<string, string> = {
  todo: "status.todo",
  in_progress: "status.inProgress",
  in_review: "status.inReview",
  done: "status.done",
  blocked: "status.blocked",
  cancelled: "status.cancelled",
  backlog: "status.backlog",
};

const PRIORITY_KEYS: Record<string, string> = {
  critical: "dashboard.priorityCritical",
  high: "dashboard.priorityHigh",
  medium: "dashboard.priorityMedium",
  low: "dashboard.priorityLow",
};

function useStatusLabel() {
  const { t } = useTranslation();
  return (status: string) => STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function usePriorityLabel() {
  const { t } = useTranslation();
  return (priority: string) => (PRIORITY_KEYS[priority] ? t(PRIORITY_KEYS[priority]) : priority);
}

/* ── View state ── */

export type IssueViewState = {
  statuses: string[];
  priorities: string[];
  assignees: string[];
  labels: string[];
  sortField: "status" | "priority" | "title" | "created" | "updated";
  sortDir: "asc" | "desc";
  groupBy: "status" | "priority" | "assignee" | "none";
  viewMode: "list" | "board";
  collapsedGroups: string[];
};

const defaultViewState: IssueViewState = {
  statuses: [],
  priorities: [],
  assignees: [],
  labels: [],
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  viewMode: "list",
  collapsedGroups: [],
};

const quickFilterPresets = [
  { labelKey: "issuesList.quickFilterAll", statuses: [] as string[] },
  { labelKey: "issuesList.quickFilterActive", statuses: ["todo", "in_progress", "in_review", "blocked"] },
  { labelKey: "status.backlog", statuses: ["backlog"] },
  { labelKey: "status.done", statuses: ["done", "cancelled"] },
];

function getViewState(key: string): IssueViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultViewState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultViewState };
}

function saveViewState(key: string, state: IssueViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function toggleInArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function applyFilters(issues: Issue[], state: IssueViewState): Issue[] {
  let result = issues;
  if (state.statuses.length > 0) result = result.filter((i) => state.statuses.includes(i.status));
  if (state.priorities.length > 0) result = result.filter((i) => state.priorities.includes(i.priority));
  if (state.assignees.length > 0) result = result.filter((i) => i.assigneeAgentId != null && state.assignees.includes(i.assigneeAgentId));
  if (state.labels.length > 0) result = result.filter((i) => (i.labelIds ?? []).some((id) => state.labels.includes(id)));
  return result;
}

function sortIssues(issues: Issue[], state: IssueViewState): Issue[] {
  const sorted = [...issues];
  const dir = state.sortDir === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    switch (state.sortField) {
      case "status":
        return dir * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
      case "priority":
        return dir * (priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
      case "title":
        return dir * a.title.localeCompare(b.title);
      case "created":
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      case "updated":
        return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      default:
        return 0;
    }
  });
  return sorted;
}

function countActiveFilters(state: IssueViewState): number {
  let count = 0;
  if (state.statuses.length > 0) count++;
  if (state.priorities.length > 0) count++;
  if (state.assignees.length > 0) count++;
  if (state.labels.length > 0) count++;
  return count;
}

/* ── Component ── */

interface Agent {
  id: string;
  name: string;
}

interface IssuesListProps {
  issues: Issue[];
  isLoading?: boolean;
  error?: Error | null;
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  projectId?: string;
  viewStateKey: string;
  issueLinkState?: unknown;
  initialAssignees?: string[];
  initialSearch?: string;
  onSearchChange?: (search: string) => void;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void | Promise<unknown>;
  /** 批次刪除；未提供時 bulk bar 不顯示刪除（仍可做狀態／指派等變更）。 */
  onRemoveIssue?: (id: string) => void | Promise<unknown>;
}

export function IssuesList({
  issues,
  isLoading,
  error,
  agents,
  liveIssueIds,
  projectId,
  viewStateKey,
  issueLinkState,
  initialAssignees,
  initialSearch,
  onSearchChange,
  onUpdateIssue,
  onRemoveIssue,
}: IssuesListProps) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const statusLabel = useStatusLabel();
  const priorityLabel = usePriorityLabel();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialog();

  // Scope the storage key per company so folding/view state is independent across companies.
  const scopedKey = selectedCompanyId ? `${viewStateKey}:${selectedCompanyId}` : viewStateKey;

  const [viewState, setViewState] = useState<IssueViewState>(() => {
    if (initialAssignees) {
      return { ...defaultViewState, assignees: initialAssignees, statuses: [] };
    }
    return getViewState(scopedKey);
  });
  const [assigneePickerIssueId, setAssigneePickerIssueId] = useState<string | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [issueSearch, setIssueSearch] = useState(initialSearch ?? "");
  const [debouncedIssueSearch, setDebouncedIssueSearch] = useState(issueSearch);
  const normalizedIssueSearch = debouncedIssueSearch.trim();

  useEffect(() => {
    setIssueSearch(initialSearch ?? "");
  }, [initialSearch]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedIssueSearch(issueSearch);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [issueSearch]);

  // Reload view state from localStorage when company changes (scopedKey changes).
  const prevScopedKey = useRef(scopedKey);
  useEffect(() => {
    if (prevScopedKey.current !== scopedKey) {
      prevScopedKey.current = scopedKey;
      setViewState(initialAssignees
        ? { ...defaultViewState, assignees: initialAssignees, statuses: [] }
        : getViewState(scopedKey));
    }
  }, [scopedKey, initialAssignees]);

  const updateView = useCallback((patch: Partial<IssueViewState>) => {
    setViewState((prev) => {
      const next = { ...prev, ...patch };
      saveViewState(scopedKey, next);
      return next;
    });
  }, [scopedKey]);

  const { data: searchedIssuesRaw } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, normalizedIssueSearch, projectId),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: normalizedIssueSearch, projectId }),
    enabled: !!selectedCompanyId && normalizedIssueSearch.length > 0,
  });
  const searchedIssues = searchedIssuesRaw ?? EMPTY_ISSUE_LIST;

  const agentName = useCallback((id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  }, [agents]);

  const issuesResolved = issues ?? EMPTY_ISSUE_LIST;

  const filtered = useMemo(() => {
    const sourceIssues = normalizedIssueSearch.length > 0 ? searchedIssues : issuesResolved;
    const filteredByControls = applyFilters(sourceIssues, viewState);
    return sortIssues(filteredByControls, viewState);
  }, [issuesResolved, searchedIssues, viewState, normalizedIssueSearch]);

  const { data: labels } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const activeFilterCount = countActiveFilters(viewState);

  // 以 id 序列為依賴：即使 filtered 陣列參考變動，只要可見 id 集合不變就不重跑修剪 effect。
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const visibleIdsKey = useMemo(() => filtered.map((i) => i.id).join("\u0001"), [filtered]);

  useEffect(() => {
    const visibleIssueIds = filteredRef.current.map((i) => i.id);
    setSelectedIds((prev) => {
      const next = pruneSelectionToVisible(prev, visibleIssueIds);
      // 修剪結果與先前相同時必須回傳 prev，否則每次 effect 都會因新 Set 參考而觸發重新渲染，造成 maximum update depth。
      return selectionSetsEqual(prev, next) ? prev : next;
    });
  }, [visibleIdsKey]);

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const toggleSelectIssue = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearBulkSelection = useCallback(() => setSelectedIds(new Set()), []);

  const safeUpdate = useCallback(
    async (id: string, data: Record<string, unknown>) => {
      await Promise.resolve(onUpdateIssue(id, data));
    },
    [onUpdateIssue],
  );

  const runBulkPatch = useCallback(
    async (data: Record<string, unknown>) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      setBulkBusy(true);
      let failed = 0;
      try {
        for (const id of ids) {
          try {
            await safeUpdate(id, data);
          } catch {
            failed++;
          }
        }
      } finally {
        setBulkBusy(false);
      }
      if (failed === 0) {
        pushToast({ title: t("issuesList.bulkUpdateSuccess", { count: ids.length }), tone: "success" });
        setSelectedIds(new Set());
      } else {
        pushToast({
          title: t("issuesList.bulkUpdatePartial", { failed, total: ids.length }),
          tone: "warn",
        });
      }
    },
    [selectedIds, safeUpdate, pushToast, t],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!onRemoveIssue) return;
    if (!window.confirm(t("issuesList.bulkDeleteConfirm", { count: selectedIds.size }))) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          await Promise.resolve(onRemoveIssue(id));
        } catch {
          failed++;
        }
      }
    } finally {
      setBulkBusy(false);
    }
    if (failed === 0) {
      pushToast({ title: t("issuesList.bulkDeleteSuccess", { count: ids.length }), tone: "success" });
      setSelectedIds(new Set());
    } else {
      pushToast({ title: t("issuesList.bulkDeletePartial"), tone: "warn" });
    }
  }, [onRemoveIssue, selectedIds, pushToast, t]);

  const groupedContent = useMemo(() => {
    if (viewState.groupBy === "none") {
      return [{ key: "__all", label: null as string | null, items: filtered }];
    }
    if (viewState.groupBy === "status") {
      const groups = groupBy(filtered, (i) => i.status);
      return statusOrder
        .filter((s) => groups[s]?.length)
        .map((s) => ({ key: s, label: statusLabel(s), items: groups[s]! }));
    }
    if (viewState.groupBy === "priority") {
      const groups = groupBy(filtered, (i) => i.priority);
      return priorityOrder
        .filter((p) => groups[p]?.length)
        .map((p) => ({ key: p, label: statusLabel(p), items: groups[p]! }));
    }
    // assignee
    const groups = groupBy(filtered, (i) => i.assigneeAgentId ?? "__unassigned");
    return Object.keys(groups).map((key) => ({
      key,
      label: key === "__unassigned" ? "Unassigned" : (agentName(key) ?? key.slice(0, 8)),
      items: groups[key]!,
    }));
  }, [filtered, viewState.groupBy, agents]); // eslint-disable-line react-hooks/exhaustive-deps

  const newIssueDefaults = (groupKey?: string) => {
    const defaults: Record<string, string> = {};
    if (projectId) defaults.projectId = projectId;
    if (groupKey) {
      if (viewState.groupBy === "status") defaults.status = groupKey;
      else if (viewState.groupBy === "priority") defaults.priority = groupKey;
      else if (viewState.groupBy === "assignee" && groupKey !== "__unassigned") defaults.assigneeAgentId = groupKey;
    }
    return defaults;
  };

  const assignIssue = (issueId: string, assigneeAgentId: string | null) => {
    onUpdateIssue(issueId, { assigneeAgentId, assigneeUserId: null });
    setAssigneePickerIssueId(null);
    setAssigneeSearch("");
  };

  return (
    <div className="issues-page">
      <div className="issues-toolbar">
        <div className="issues-toolbar-left">
          <Button size="sm" variant="outline" onClick={() => openNewIssue(newIssueDefaults())}>
            <Plus className="issues-toolbar-btn-icon" />
            <span className="issues-toolbar-btn-label">{t("issuesList.newIssue")}</span>
          </Button>
          <div className="issues-search-wrap">
            <Search className="issues-search-icon" />
            <Input
              value={issueSearch}
              onChange={(e) => {
                setIssueSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder={t("issuesList.searchIssues")}
              className="issues-search-input"
              aria-label={t("issuesList.searchIssuesAria")}
            />
          </div>
        </div>

        <div className="issues-toolbar-right">
          <div className="issues-view-toggle">
            <button
              type="button"
              className={["issues-view-toggle-btn", viewState.viewMode === "list" && "active"].filter(Boolean).join(" ")}
              onClick={() => updateView({ viewMode: "list" })}
              title={t("issuesList.listView")}
            >
              <List />
            </button>
            <button
              type="button"
              className={["issues-view-toggle-btn", viewState.viewMode === "board" && "active"].filter(Boolean).join(" ")}
              onClick={() => updateView({ viewMode: "board" })}
              title={t("issuesList.boardView")}
            >
              <Columns3 />
            </button>
          </div>

          {selectedCompanyId ? (
            <IssuesSavedViewsMenu
              companyId={selectedCompanyId}
              scopeKey={scopedKey}
              viewState={viewState}
              issueSearch={issueSearch}
              updateView={updateView}
              setIssueSearch={setIssueSearch}
              setDebouncedIssueSearch={setDebouncedIssueSearch}
            />
          ) : null}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={["issues-filter-btn", activeFilterCount > 0 && "active-count"].filter(Boolean).join(" ")}>
                <Filter className="issues-toolbar-btn-icon-sm" />
                <span className="issues-toolbar-btn-label">{activeFilterCount > 0 ? t("issuesList.filtersCount", { count: activeFilterCount }) : t("issuesList.filter")}</span>
                {activeFilterCount > 0 && (
                  <span className="issues-filter-count-mobile">{activeFilterCount}</span>
                )}
                {activeFilterCount > 0 && (
                  <X
                    className="issues-filter-clear-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateView({ statuses: [], priorities: [], assignees: [], labels: [] });
                    }}
                  />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="issues-popover-filters">
              <div className="issues-popover-filters-inner">
                <div className="issues-popover-filters-header">
                  <span className="issues-popover-filters-title">{t("issuesList.filters")}</span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="issues-popover-clear"
                      onClick={() => updateView({ statuses: [], priorities: [], assignees: [], labels: [] })}
                    >
                      {t("issuesList.clear")}
                    </button>
                  )}
                </div>

                <div className="issues-filter-column">
                  <span className="issues-popover-section-label">{t("issuesList.quickFilters")}</span>
                  <div className="issues-quick-filters">
                    {quickFilterPresets.map((preset) => {
                      const isActive = arraysEqual(viewState.statuses, preset.statuses);
                      return (
                        <button
                          key={preset.labelKey}
                          type="button"
                          className={["issues-quick-filter-btn", isActive && "active"].filter(Boolean).join(" ")}
                          onClick={() => updateView({ statuses: isActive ? [] : [...preset.statuses] })}
                        >
                          {t(preset.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="issues-filter-divider" />

                <div className="issues-filter-grid">
                  <div className="issues-filter-column">
                    <span className="issues-popover-section-label">{t("issuesList.status")}</span>
                    <div className="issues-filter-column">
                      {statusOrder.map((s) => (
                        <label key={s} className="issues-filter-option">
                          <Checkbox
                            checked={viewState.statuses.includes(s)}
                            onCheckedChange={() => updateView({ statuses: toggleInArray(viewState.statuses, s) })}
                          />
                          <StatusIcon status={s} />
                          <span>{statusLabel(s)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="issues-filter-column">
                    <span className="issues-popover-section-label">{t("properties.priority")}</span>
                    <div className="issues-filter-column">
                      {priorityOrder.map((p) => (
                        <label key={p} className="issues-filter-option">
                          <Checkbox
                            checked={viewState.priorities.includes(p)}
                            onCheckedChange={() => updateView({ priorities: toggleInArray(viewState.priorities, p) })}
                          />
                          <PriorityIcon priority={p} />
                          <span>{priorityLabel(p)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {agents && agents.length > 0 && (
                    <div className="issues-filter-column">
                      <span className="issues-popover-section-label">{t("properties.assignee")}</span>
                      <div className="issues-filter-column issues-filter-option-scroll">
                        {agents.map((agent) => (
                          <label key={agent.id} className="issues-filter-option">
                            <Checkbox
                              checked={viewState.assignees.includes(agent.id)}
                              onCheckedChange={() => updateView({ assignees: toggleInArray(viewState.assignees, agent.id) })}
                            />
                            <span>{agent.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {labels && labels.length > 0 && (
                    <div className="issues-filter-column">
                      <span className="issues-popover-section-label">{t("properties.labels")}</span>
                      <div className="issues-filter-column issues-filter-option-scroll">
                        {labels.map((label) => (
                          <label key={label.id} className="issues-filter-option">
                            <Checkbox
                              checked={viewState.labels.includes(label.id)}
                              onCheckedChange={() => updateView({ labels: toggleInArray(viewState.labels, label.id) })}
                            />
                            <span style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: label.color }} />
                            <span>{label.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Sort (list view only) */}
          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="issues-toolbar-btn-text">
                  <ArrowUpDown className="issues-toolbar-btn-icon-sm" />
                  <span className="issues-toolbar-btn-label">{t("issuesList.sort")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="issues-popover-menu">
                <div className="issues-popover-menu-inner">
                  {([
                    ["status", t("issuesList.status")],
                    ["priority", t("properties.priority")],
                    ["title", t("issuesList.title")],
                    ["created", t("properties.created")],
                    ["updated", t("properties.updated")],
                  ] as const).map(([field, label]) => (
                    <button
                      key={field}
                      type="button"
                      className={["issues-popover-menu-btn", viewState.sortField === field && "active"].filter(Boolean).join(" ")}
                      onClick={() => {
                        if (viewState.sortField === field) {
                          updateView({ sortDir: viewState.sortDir === "asc" ? "desc" : "asc" });
                        } else {
                          updateView({ sortField: field, sortDir: "asc" });
                        }
                      }}
                    >
                      <span>{label}</span>
                      {viewState.sortField === field && (
                        <span className="suffix">
                          {viewState.sortDir === "asc" ? "\u2191" : "\u2193"}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {viewState.viewMode === "list" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="issues-toolbar-btn-text">
                  <Layers className="issues-toolbar-btn-icon-sm" />
                  <span className="issues-toolbar-btn-label">{t("issuesList.group")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="issues-popover-menu">
                <div className="issues-popover-menu-inner">
                  {([
                    ["status", t("issuesList.status")],
                    ["priority", t("properties.priority")],
                    ["assignee", t("properties.assignee")],
                    ["none", t("issuesList.none")],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={["issues-popover-menu-btn", viewState.groupBy === value && "active"].filter(Boolean).join(" ")}
                      onClick={() => updateView({ groupBy: value })}
                    >
                      <span>{label}</span>
                      {viewState.groupBy === value && <Check className="issues-popover-check-icon" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {isLoading && <PageSkeleton variant="issues-list" />}
      {error && <p className="issues-error">{error.message}</p>}

      {!isLoading && filtered.length === 0 && viewState.viewMode === "list" && (
        <EmptyState
          icon={CircleDot}
          message={t("issuesList.noIssuesMatch")}
          action={t("issuesList.newIssue")}
          onAction={() => openNewIssue(newIssueDefaults())}
        />
      )}

      {viewState.viewMode === "board" ? (
        <KanbanBoard
          issues={filtered}
          agents={agents}
          liveIssueIds={liveIssueIds}
          onUpdateIssue={onUpdateIssue}
          selection={{ selectedIds, onToggle: toggleSelectIssue }}
        />
      ) : (
        groupedContent.map((group) => {
          const isOpen = !viewState.collapsedGroups.includes(group.key);
          return (
          <div key={group.key} className={["issues-group", isOpen && "open"].filter(Boolean).join(" ")}>
          <Collapsible
            open={isOpen}
            onOpenChange={(open) => {
              updateView({
                collapsedGroups: open
                  ? viewState.collapsedGroups.filter((k) => k !== group.key)
                  : [...viewState.collapsedGroups, group.key],
              });
            }}
          >
            {group.label && (
              <div className="issues-group-header">
                <CollapsibleTrigger className="issues-group-trigger">
                  <ChevronRight />
                  <span className="issues-group-label">{group.label}</span>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="issues-group-add-btn"
                  onClick={() => openNewIssue(newIssueDefaults(group.key))}
                >
                  <Plus className="issues-group-add-btn-icon" />
                </Button>
              </div>
            )}
            <CollapsibleContent>
              <div className={["issues-list", selectedIds.size > 0 && "issues-list-has-selection"].filter(Boolean).join(" ")}>
              {group.items.map((issue) => (
                <div
                  key={issue.id}
                  role="group"
                  aria-label={issue.title}
                  className={[
                    "issues-row-container",
                    selectedIds.has(issue.id) && "issues-row-container--selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div
                    className="issues-row-select"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedIds.has(issue.id)}
                      onCheckedChange={() => toggleSelectIssue(issue.id)}
                      aria-label={t("issuesList.selectRowAria", { title: issue.title })}
                    />
                  </div>
                  <IssueRow
                  issue={issue}
                  issueLinkState={issueLinkState}
                  className="issues-row--in-container"
                  desktopLeadingSpacer
                  mobileLeading={(
                    <span
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <StatusIcon
                        status={issue.status}
                        onChange={(s) => onUpdateIssue(issue.id, { status: s })}
                      />
                    </span>
                  )}
                  desktopMetaLeading={(
                    <>
                      <span className="issues-row-meta-icon">
                        <PriorityIcon priority={issue.priority} />
                      </span>
                      <span
                        className="issues-row-meta-icon"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <StatusIcon
                          status={issue.status}
                          onChange={(s) => onUpdateIssue(issue.id, { status: s })}
                        />
                      </span>
                      <span className="issues-row-id">
                        {issue.identifier ?? issue.id.slice(0, 8)}
                      </span>
                      {liveIssueIds?.has(issue.id) && (
                        <span className="issues-row-live">
                          <span className="issues-row-live-dot" />
                          <span className="issues-row-live-text">Live</span>
                        </span>
                      )}
                    </>
                  )}
                  mobileMeta={timeAgo(issue.updatedAt)}
                  desktopTrailing={(
                    <>
                      {(issue.labels ?? []).length > 0 && (
                        <span className="issues-row-labels">
                          {(issue.labels ?? []).slice(0, 3).map((label) => (
                            <span
                              key={label.id}
                              className="issues-row-label-chip"
                              style={{
                                borderColor: label.color,
                                color: label.color,
                                backgroundColor: `${label.color}1f`,
                              }}
                            >
                              {label.name}
                            </span>
                          ))}
                          {(issue.labels ?? []).length > 3 && (
                            <span className="issues-row-label-more">
                              +{(issue.labels ?? []).length - 3}
                            </span>
                          )}
                        </span>
                      )}
                      <Popover
                        open={assigneePickerIssueId === issue.id}
                        onOpenChange={(open) => {
                          setAssigneePickerIssueId(open ? issue.id : null);
                          if (!open) setAssigneeSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="issues-assignee-trigger"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            {issue.assigneeAgentId && agentName(issue.assigneeAgentId) ? (
                              <Identity name={agentName(issue.assigneeAgentId)!} size="sm" className="issues-identity-min-w-0" />
                            ) : (
                              <span className="issues-assignee-empty">
                                <span className="issues-assignee-empty-icon">
                                  <User />
                                </span>
                                Assignee
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="issues-assignee-popover"
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDownOutside={() => setAssigneeSearch("")}
                        >
                          <input
                            className="issues-assignee-search"
                            placeholder="Search agents..."
                            value={assigneeSearch}
                            onChange={(e) => setAssigneeSearch(e.target.value)}
                            autoFocus
                          />
                          <div className="issues-assignee-list">
                            <button
                              type="button"
                              className={["issues-assignee-option", !issue.assigneeAgentId && "active"].filter(Boolean).join(" ")}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                assignIssue(issue.id, null);
                              }}
                            >
                              No assignee
                            </button>
                            {(agents ?? [])
                              .filter((agent) => {
                                if (!assigneeSearch.trim()) return true;
                                return agent.name
                                  .toLowerCase()
                                  .includes(assigneeSearch.toLowerCase());
                              })
                              .map((agent) => (
                                <button
                                  key={agent.id}
                                  type="button"
                                  className={["issues-assignee-option", issue.assigneeAgentId === agent.id && "active"].filter(Boolean).join(" ")}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    assignIssue(issue.id, agent.id);
                                  }}
                                >
                                  <Identity name={agent.name} size="sm" className="issues-identity-min-w-0" />
                                </button>
                              ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </>
                  )}
                  trailingMeta={formatDate(issue.createdAt)}
                />
                </div>
              ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
          </div>
          );
        })
      )}

      <IssuesBulkBar
        selectedCount={selectedIds.size}
        agents={agents}
        projects={projects}
        busy={bulkBusy}
        onSetStatus={(s) => void runBulkPatch({ status: s })}
        onSetPriority={(p) => void runBulkPatch({ priority: p })}
        onSetAssignee={(id) => void runBulkPatch({ assigneeAgentId: id, assigneeUserId: null })}
        onSetProject={(pid) => void runBulkPatch({ projectId: pid })}
        onDelete={onRemoveIssue ? handleBulkDelete : undefined}
        onClear={clearBulkSelection}
      />
    </div>
  );
}
