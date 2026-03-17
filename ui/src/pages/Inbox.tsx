import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { dashboardApi } from "../api/dashboard";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ApprovalCard } from "../components/ApprovalCard";
import { IssueRow } from "../components/IssueRow";
import { PriorityIcon } from "../components/PriorityIcon";
import { StatusIcon } from "../components/StatusIcon";
import { StatusBadge } from "../components/StatusBadge";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox as InboxIcon,
  AlertTriangle,
  ArrowUpRight,
  XCircle,
  X,
  RotateCcw,
} from "lucide-react";
import { Identity } from "../components/Identity";
import { PageTabBar } from "../components/PageTabBar";
import type { HeartbeatRun, Issue, JoinRequest } from "@paperclipai/shared";
import {
  ACTIONABLE_APPROVAL_STATUSES,
  getLatestFailedRunsByAgent,
  getRecentTouchedIssues,
  type InboxTab,
  saveLastInboxTab,
} from "../lib/inbox";
import { useDismissedInboxItems } from "../hooks/useInboxBadge";
import "../styles/issues-list.css";
import "./Inbox.css";

type InboxCategoryFilter =
  | "everything"
  | "issues_i_touched"
  | "join_requests"
  | "approvals"
  | "failed_runs"
  | "alerts";
type InboxApprovalFilter = "all" | "actionable" | "resolved";
type SectionKey =
  | "issues_i_touched"
  | "join_requests"
  | "approvals"
  | "failed_runs"
  | "alerts";

const RUN_SOURCE_KEYS: Record<string, string> = {
  timer: "inbox.scheduled",
  assignment: "inbox.assignment",
  on_demand: "inbox.manual",
  automation: "inbox.automation",
};

function firstNonEmptyLine(value: string | null | undefined): string | null {
  if (!value) return null;
  const line = value.split("\n").map((chunk) => chunk.trim()).find(Boolean);
  return line ?? null;
}

function runFailureMessage(run: HeartbeatRun, t: (key: string) => string): string {
  const raw = firstNonEmptyLine(run.error) ?? firstNonEmptyLine(run.stderrExcerpt) ?? null;
  if (!raw) return t("inbox.runExitedError");
  if (raw.includes("Process lost") && raw.includes("server may have restarted")) return t("inbox.processLost");
  return raw;
}

function readIssueIdFromRun(run: HeartbeatRun): string | null {
  const context = run.contextSnapshot;
  if (!context) return null;

  const issueId = context["issueId"];
  if (typeof issueId === "string" && issueId.length > 0) return issueId;

  const taskId = context["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) return taskId;

  return null;
}

function FailedRunCard({
  run,
  issueById,
  agentName: linkedAgentName,
  issueLinkState,
  onDismiss,
}: {
  run: HeartbeatRun;
  issueById: Map<string, Issue>;
  agentName: string | null;
  issueLinkState: unknown;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const issueId = readIssueIdFromRun(run);
  const issue = issueId ? issueById.get(issueId) ?? null : null;
  const sourceLabel = t(RUN_SOURCE_KEYS[run.invocationSource] ?? "inbox.manual");
  const displayError = runFailureMessage(run, t);

  const retryRun = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      const context = run.contextSnapshot as Record<string, unknown> | null;
      if (context) {
        if (typeof context.issueId === "string" && context.issueId) payload.issueId = context.issueId;
        if (typeof context.taskId === "string" && context.taskId) payload.taskId = context.taskId;
        if (typeof context.taskKey === "string" && context.taskKey) payload.taskKey = context.taskKey;
      }
      const result = await agentsApi.wakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "retry_failed_run",
        payload,
      });
      if (!("id" in result)) {
        throw new Error("Retry was skipped because the agent is not currently invokable.");
      }
      return result;
    },
    onSuccess: (newRun) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(run.companyId, run.agentId) });
      navigate(`/agents/${run.agentId}/runs/${newRun.id}`);
    },
  });

  return (
    <div className="inbox-failed-run-card">
      <button
        type="button"
        className="inbox-failed-run-dismiss"
        onClick={onDismiss}
        aria-label={t("inbox.dismiss")}
      >
        <X />
      </button>
      <div className="inbox-failed-run-content">
        {issue ? (
          <Link
            to={`/issues/${issue.identifier ?? issue.id}`}
            state={issueLinkState}
            className="inbox-failed-run-link"
          >
            <span className="inbox-failed-run-link-id">
              {issue.identifier ?? issue.id.slice(0, 8)}
            </span>
            {issue.title}
          </Link>
        ) : (
          <span className="inbox-failed-run-no-issue">
            {run.errorCode ? t("inbox.errorCode", { code: run.errorCode }) : t("inbox.noLinkedIssue")}
          </span>
        )}

        <div className="inbox-failed-run-row">
          <div className="inbox-failed-run-meta-wrap">
            <div className="inbox-failed-run-meta-line">
              <span className="inbox-failed-run-meta-icon">
                <XCircle />
              </span>
              {linkedAgentName ? (
                <Identity name={linkedAgentName} size="sm" />
              ) : (
                <span className="inbox-join-title">{t("inbox.agentIdShort", { id: run.agentId.slice(0, 8) })}</span>
              )}
              <StatusBadge status={run.status} />
            </div>
            <p className="inbox-failed-run-meta-time">
              {t("inbox.runFailedAgo", { source: sourceLabel, time: formatRelativeTime(t, run.createdAt) })}
            </p>
          </div>
          <div className="inbox-failed-run-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => retryRun.mutate()}
              disabled={retryRun.isPending}
            >
              <RotateCcw />
              {retryRun.isPending ? t("inbox.retrying") : t("inbox.retry")}
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to={`/agents/${run.agentId}/runs/${run.id}`}>
                {t("inbox.openRun")}
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>

        <div className="inbox-failed-run-error-box">
          {displayError}
        </div>

        <div className="inbox-failed-run-id">
          <span>run {run.id.slice(0, 8)}</span>
        </div>

        {retryRun.isError && (
          <div className="inbox-failed-run-retry-error">
            {retryRun.error instanceof Error ? retryRun.error.message : t("inbox.failedToRetryRun")}
          </div>
        )}
      </div>
    </div>
  );
}

export function Inbox() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [allCategoryFilter, setAllCategoryFilter] = useState<InboxCategoryFilter>("everything");
  const [allApprovalFilter, setAllApprovalFilter] = useState<InboxApprovalFilter>("all");
  const { dismissed, dismiss } = useDismissedInboxItems();

  const pathSegment = location.pathname.split("/").pop() ?? "recent";
  const tab: InboxTab =
    pathSegment === "all" || pathSegment === "unread" ? pathSegment : "recent";
  const issueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        t("nav.inbox"),
        `${location.pathname}${location.search}${location.hash}`,
      ),
    [location.pathname, location.search, location.hash, t],
  );

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.inbox") }]);
  }, [setBreadcrumbs, t]);

  useEffect(() => {
    saveLastInboxTab(tab);
  }, [tab]);

  const {
    data: approvals,
    isLoading: isApprovalsLoading,
    error: approvalsError,
  } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const {
    data: joinRequests = [],
    isLoading: isJoinRequestsLoading,
  } = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId!),
    queryFn: async () => {
      try {
        return await accessApi.listJoinRequests(selectedCompanyId!, "pending_approval");
      } catch (err) {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          return [];
        }
        throw err;
      }
    },
    enabled: !!selectedCompanyId,
    retry: false,
  });

  const { data: dashboard, isLoading: isDashboardLoading } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues, isLoading: isIssuesLoading } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const {
    data: touchedIssuesRaw = [],
    isLoading: isTouchedIssuesLoading,
  } = useQuery({
    queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId!),
    queryFn: () =>
      issuesApi.list(selectedCompanyId!, {
        touchedByUserId: "me",
        status: "backlog,todo,in_progress,in_review,blocked,done",
      }),
    enabled: !!selectedCompanyId,
  });

  const { data: heartbeatRuns, isLoading: isRunsLoading } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const touchedIssues = useMemo(() => getRecentTouchedIssues(touchedIssuesRaw), [touchedIssuesRaw]);
  const unreadTouchedIssues = useMemo(
    () => touchedIssues.filter((issue) => issue.isUnreadForMe),
    [touchedIssues],
  );

  const agentById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const failedRuns = useMemo(
    () => getLatestFailedRunsByAgent(heartbeatRuns ?? []).filter((r) => !dismissed.has(`run:${r.id}`)),
    [heartbeatRuns, dismissed],
  );
  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of heartbeatRuns ?? []) {
      if (run.status !== "running" && run.status !== "queued") continue;
      const issueId = readIssueIdFromRun(run);
      if (issueId) ids.add(issueId);
    }
    return ids;
  }, [heartbeatRuns]);

  const allApprovals = useMemo(
    () =>
      [...(approvals ?? [])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [approvals],
  );

  const actionableApprovals = useMemo(
    () => allApprovals.filter((approval) => ACTIONABLE_APPROVAL_STATUSES.has(approval.status)),
    [allApprovals],
  );

  const filteredAllApprovals = useMemo(() => {
    if (allApprovalFilter === "all") return allApprovals;

    return allApprovals.filter((approval) => {
      const isActionable = ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
      return allApprovalFilter === "actionable" ? isActionable : !isActionable;
    });
  }, [allApprovals, allApprovalFilter]);

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agentById.get(id) ?? null;
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const approveJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.approveJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve join request");
    },
  });

  const rejectJoinMutation = useMutation({
    mutationFn: (joinRequest: JoinRequest) =>
      accessApi.rejectJoinRequest(selectedCompanyId!, joinRequest.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject join request");
    },
  });

  const [fadingOutIssues, setFadingOutIssues] = useState<Set<string>>(new Set());

  const invalidateInboxIssueQueries = () => {
    if (!selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.listUnreadTouchedByMe(selectedCompanyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => issuesApi.markRead(id),
    onMutate: (id) => {
      setFadingOutIssues((prev) => new Set(prev).add(id));
    },
    onSuccess: () => {
      invalidateInboxIssueQueries();
    },
    onSettled: (_data, _error, id) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async (issueIds: string[]) => {
      await Promise.all(issueIds.map((issueId) => issuesApi.markRead(issueId)));
    },
    onMutate: (issueIds) => {
      setFadingOutIssues((prev) => {
        const next = new Set(prev);
        for (const issueId of issueIds) next.add(issueId);
        return next;
      });
    },
    onSuccess: () => {
      invalidateInboxIssueQueries();
    },
    onSettled: (_data, _error, issueIds) => {
      setTimeout(() => {
        setFadingOutIssues((prev) => {
          const next = new Set(prev);
          for (const issueId of issueIds) next.delete(issueId);
          return next;
        });
      }, 300);
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={InboxIcon} message="Select a company to view inbox." />;
  }

  const hasRunFailures = failedRuns.length > 0;
  const showAggregateAgentError = !!dashboard && dashboard.agents.error > 0 && !hasRunFailures && !dismissed.has("alert:agent-errors");
  const showBudgetAlert =
    !!dashboard &&
    dashboard.costs.monthBudgetCents > 0 &&
    dashboard.costs.monthUtilizationPercent >= 80 &&
    !dismissed.has("alert:budget");
  const hasAlerts = showAggregateAgentError || showBudgetAlert;
  const hasJoinRequests = joinRequests.length > 0;
  const hasTouchedIssues = touchedIssues.length > 0;

  const showJoinRequestsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "join_requests";
  const showTouchedCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "issues_i_touched";
  const showApprovalsCategory = allCategoryFilter === "everything" || allCategoryFilter === "approvals";
  const showFailedRunsCategory =
    allCategoryFilter === "everything" || allCategoryFilter === "failed_runs";
  const showAlertsCategory = allCategoryFilter === "everything" || allCategoryFilter === "alerts";

  const approvalsToRender = tab === "all" ? filteredAllApprovals : actionableApprovals;
  const showTouchedSection =
    tab === "all"
      ? showTouchedCategory && hasTouchedIssues
      : tab === "unread"
        ? unreadTouchedIssues.length > 0
        : hasTouchedIssues;
  const showJoinRequestsSection =
    tab === "all" ? showJoinRequestsCategory && hasJoinRequests : tab === "unread" && hasJoinRequests;
  const showApprovalsSection = tab === "all"
    ? showApprovalsCategory && filteredAllApprovals.length > 0
    : actionableApprovals.length > 0;
  const showFailedRunsSection =
    tab === "all" ? showFailedRunsCategory && hasRunFailures : tab === "unread" && hasRunFailures;
  const showAlertsSection = tab === "all" ? showAlertsCategory && hasAlerts : tab === "unread" && hasAlerts;

  const visibleSections = [
    showFailedRunsSection ? "failed_runs" : null,
    showAlertsSection ? "alerts" : null,
    showApprovalsSection ? "approvals" : null,
    showJoinRequestsSection ? "join_requests" : null,
    showTouchedSection ? "issues_i_touched" : null,
  ].filter((key): key is SectionKey => key !== null);

  const allLoaded =
    !isJoinRequestsLoading &&
    !isApprovalsLoading &&
    !isDashboardLoading &&
    !isIssuesLoading &&
    !isTouchedIssuesLoading &&
    !isRunsLoading;

  const showSeparatorBefore = (key: SectionKey) => visibleSections.indexOf(key) > 0;
  const unreadIssueIds = unreadTouchedIssues
    .filter((issue) => !fadingOutIssues.has(issue.id))
    .map((issue) => issue.id);
  const canMarkAllRead = unreadIssueIds.length > 0;

  return (
    <div className="inbox-page">
      <div className="inbox-header">
        <div className="inbox-header-left">
          <Tabs value={tab} onValueChange={(value) => navigate(`/inbox/${value}`)}>
            <PageTabBar
              items={[
                { value: "recent", label: t("inbox.recent") },
                { value: "unread", label: t("inbox.unread") },
                { value: "all", label: t("inbox.all") },
              ]}
            />
          </Tabs>

          {canMarkAllRead && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate(unreadIssueIds)}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? t("inbox.marking") : t("inbox.markAllAsRead")}
            </Button>
          )}
        </div>

        {tab === "all" && (
          <div className="inbox-header-right">
            <Select
              value={allCategoryFilter}
              onValueChange={(value) => setAllCategoryFilter(value as InboxCategoryFilter)}
            >
              <SelectTrigger className="inbox-select-trigger">
                <SelectValue placeholder={t("inbox.category")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everything">{t("inbox.allCategories")}</SelectItem>
                <SelectItem value="issues_i_touched">{t("inbox.myRecentIssues")}</SelectItem>
                <SelectItem value="join_requests">{t("inbox.joinRequests")}</SelectItem>
                <SelectItem value="approvals">{t("inbox.approvals")}</SelectItem>
                <SelectItem value="failed_runs">{t("inbox.failedRunsCat")}</SelectItem>
                <SelectItem value="alerts">{t("inbox.alerts")}</SelectItem>
              </SelectContent>
            </Select>

            {showApprovalsCategory && (
              <Select
                value={allApprovalFilter}
                onValueChange={(value) => setAllApprovalFilter(value as InboxApprovalFilter)}
              >
                <SelectTrigger className="inbox-select-trigger">
                  <SelectValue placeholder={t("inbox.approvalStatus")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("inbox.allApprovalStatuses")}</SelectItem>
                  <SelectItem value="actionable">{t("inbox.needsAction")}</SelectItem>
                  <SelectItem value="resolved">{t("inbox.resolved")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {approvalsError && <p className="inbox-errors">{approvalsError.message}</p>}
      {actionError && <p className="inbox-errors">{actionError}</p>}

      {!allLoaded && visibleSections.length === 0 && (
        <PageSkeleton variant="inbox" />
      )}

      {allLoaded && visibleSections.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          message={
            tab === "unread"
              ? t("inbox.noNewInboxItems")
              : tab === "recent"
                ? t("inbox.noRecentInboxItems")
                : t("inbox.noInboxItemsMatch")
          }
        />
      )}

      {showApprovalsSection && (
        <>
          {showSeparatorBefore("approvals") && <Separator />}
          <div className="inbox-section">
            <h3 className="inbox-section-title">
              {tab === "unread" ? t("inbox.approvalsNeedingAction") : t("inbox.approvals")}
            </h3>
            <div className="inbox-grid">
              {approvalsToRender.map((approval) => (
                <ApprovalCard
                  key={approval.id}
                  approval={approval}
                  requesterAgent={
                    approval.requestedByAgentId
                      ? (agents ?? []).find((a) => a.id === approval.requestedByAgentId) ?? null
                      : null
                  }
                  onApprove={() => approveMutation.mutate(approval.id)}
                  onReject={() => rejectMutation.mutate(approval.id)}
                  detailLink={`/approvals/${approval.id}`}
                  isPending={approveMutation.isPending || rejectMutation.isPending}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {showJoinRequestsSection && (
        <>
          {showSeparatorBefore("join_requests") && <Separator />}
          <div className="inbox-section">
            <h3 className="inbox-section-title">
              {t("inbox.joinRequests")}
            </h3>
            <div className="inbox-grid">
              {joinRequests.map((joinRequest) => (
                <div key={joinRequest.id} className="inbox-join-card">
                  <div className="inbox-join-inner">
                    <div className="inbox-join-body">
                      <p className="inbox-join-title">
                        {joinRequest.requestType === "human"
                          ? "Human join request"
                          : `Agent join request${joinRequest.agentName ? `: ${joinRequest.agentName}` : ""}`}
                      </p>
                      <p className="inbox-join-meta">
                        {t("inbox.requestedAgoFromIp", { time: formatRelativeTime(t, joinRequest.createdAt), ip: joinRequest.requestIp })}
                      </p>
                      {joinRequest.requestEmailSnapshot && (
                        <p className="inbox-join-meta">
                          email: {joinRequest.requestEmailSnapshot}
                        </p>
                      )}
                      {joinRequest.adapterType && (
                        <p className="inbox-join-meta">adapter: {joinRequest.adapterType}</p>
                      )}
                    </div>
                    <div className="inbox-join-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                        onClick={() => rejectJoinMutation.mutate(joinRequest)}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                        onClick={() => approveJoinMutation.mutate(joinRequest)}
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {showFailedRunsSection && (
        <>
          {showSeparatorBefore("failed_runs") && <Separator />}
          <div className="inbox-section">
            <h3 className="inbox-section-title">
              {t("inbox.failedRuns")}
            </h3>
            <div className="inbox-grid">
              {failedRuns.map((run) => (
                <FailedRunCard
                  key={run.id}
                  run={run}
                  issueById={issueById}
                  agentName={agentName(run.agentId)}
                  issueLinkState={issueLinkState}
                  onDismiss={() => dismiss(`run:${run.id}`)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {showAlertsSection && (
        <>
          {showSeparatorBefore("alerts") && <Separator />}
          <div className="inbox-section">
            <h3 className="inbox-section-title">
              Alerts
            </h3>
            <div className="inbox-alerts-list">
              {showAggregateAgentError && (
                <div className="inbox-alert-row">
                  <Link to="/agents" className="inbox-alert-link">
                    <AlertTriangle className="inbox-alert-icon red" />
                    <span className="inbox-alert-text">
                      <strong>{dashboard!.agents.error}</strong>{" "}
                      {dashboard!.agents.error === 1 ? "agent has" : "agents have"} errors
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="inbox-alert-dismiss"
                    onClick={() => dismiss("alert:agent-errors")}
                    aria-label="Dismiss"
                  >
                    <X />
                  </button>
                </div>
              )}
              {showBudgetAlert && (
                <div className="inbox-alert-row">
                  <Link to="/costs" className="inbox-alert-link">
                    <AlertTriangle className="inbox-alert-icon yellow" />
                    <span className="inbox-alert-text">
                      Budget at <strong>{dashboard!.costs.monthUtilizationPercent}%</strong>{" "}
                      utilization this month
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="inbox-alert-dismiss"
                    onClick={() => dismiss("alert:budget")}
                    aria-label="Dismiss"
                  >
                    <X />
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showTouchedSection && (
        <>
          {showSeparatorBefore("issues_i_touched") && <Separator />}
          <div className="inbox-section inbox-issues-wrap">
            <div className="issues-list">
              {(tab === "unread" ? unreadTouchedIssues : touchedIssues).map((issue) => {
                const isUnread = issue.isUnreadForMe && !fadingOutIssues.has(issue.id);
                const isFading = fadingOutIssues.has(issue.id);
                return (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    issueLinkState={issueLinkState}
                    desktopMetaLeading={(
                      <>
                        <span className="issues-row-meta-icon">
                          <PriorityIcon priority={issue.priority} />
                        </span>
                        <span className="issues-row-meta-icon">
                          <StatusIcon status={issue.status} />
                        </span>
                        <span className="issues-row-id">
                          {issue.identifier ?? issue.id.slice(0, 8)}
                        </span>
                        {liveIssueIds.has(issue.id) && (
                          <span className="issues-row-live">
                            <span className="issues-row-live-dot" />
                            <span className="issues-row-live-text">Live</span>
                          </span>
                        )}
                      </>
                    )}
                    mobileMeta={
                      issue.lastExternalCommentAt
                        ? t("inbox.commentedAgo", { time: formatRelativeTime(t, issue.lastExternalCommentAt) })
                        : t("inbox.updatedAgo", { time: formatRelativeTime(t, issue.updatedAt) })
                    }
                    unreadState={isUnread ? "visible" : isFading ? "fading" : "hidden"}
                    onMarkRead={() => markReadMutation.mutate(issue.id)}
                    trailingMeta={
                      issue.lastExternalCommentAt
                        ? t("inbox.commentedAgo", { time: formatRelativeTime(t, issue.lastExternalCommentAt) })
                        : t("inbox.updatedAgo", { time: formatRelativeTime(t, issue.updatedAt) })
                    }
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
