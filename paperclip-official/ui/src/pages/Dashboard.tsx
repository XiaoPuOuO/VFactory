import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { formatCents } from "../lib/utils";

import "./Dashboard.css";
import { AlertCircle, AlertTriangle, Bot, CircleDot, DollarSign, ShieldCheck, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSection } from "../components/PageSection";
import { DashboardRecentIssueRow } from "../components/DashboardRecentIssueRow";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import {
  ChartCard,
  RunActivityChart,
  PriorityChart,
  IssueStatusChart,
  SuccessRateChart,
  IssueThroughputTrendChart,
  ActiveAgentsTrendChart,
  GoalIssuesTrendChart,
} from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent, Issue } from "@paperclipai/shared";

const DASHBOARD_TREND_DAYS = 14;

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function Dashboard() {
  const { t } = useTranslation();
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("dashboard.title") }]);
  }, [setBreadcrumbs, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: trendData } = useQuery({
    queryKey: queryKeys.dashboardTrends(selectedCompanyId!, DASHBOARD_TREND_DAYS),
    queryFn: () => dashboardApi.trends(selectedCompanyId!, DASHBOARD_TREND_DAYS),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: async () => (await heartbeatsApi.list(selectedCompanyId!)).runs,
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message={t("dashboard.welcomeMessage")}
          action={t("dashboard.getStarted")}
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message={t("dashboard.selectCompanyMessage")} />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  return (
    <div className="dashboard-page">
      {error && (
        <div data-slot="inline-alert" data-variant="error" role="alert">
          <AlertCircle aria-hidden />
          <div>
            <div data-slot="inline-alert-title">{t("dashboard.loadErrorTitle")}</div>
            {error.message}
          </div>
        </div>
      )}

      {hasNoAgents && (
        <div className="dashboard-inline-alert-row">
          <div data-slot="inline-alert" data-variant="warning" role="status">
            <AlertTriangle aria-hidden />
            <div>
              <div data-slot="inline-alert-title">{t("dashboard.noAgentsAlertTitle")}</div>
              {t("dashboard.noAgents")}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
          >
            {t("dashboard.createAgentHere")}
          </Button>
        </div>
      )}

      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">{t("dashboard.title")}</h1>
        <p className="dashboard-page-subtitle">{t("dashboard.pageSubtitle")}</p>
      </header>

      <div className="dashboard-layout">
        <div className="dashboard-layout-main">
          {data ? (
            <>
          <div className="dashboard-metrics-grid">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label={t("dashboard.agentsEnabled")}
              to="/agents"
              description={
                <span>
                  {data.agents.running} {t("dashboard.running")}{", "}
                  {data.agents.paused} {t("dashboard.paused")}{", "}
                  {data.agents.error} {t("dashboard.errors")}
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label={t("dashboard.tasksInProgress")}
              to="/issues"
              description={
                <span>
                  {data.tasks.open} {t("dashboard.open")}{", "}
                  {data.tasks.blocked} {t("dashboard.blocked")}
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label={t("dashboard.monthSpend")}
              to="/costs"
              description={
                <span className="dashboard-metric-card-desc-stack">
                  <span>
                    {data.costs.monthBudgetCents > 0
                      ? t("dashboard.budgetOf", {
                          percent: data.costs.monthUtilizationPercent,
                          budget: formatCents(data.costs.monthBudgetCents),
                        })
                      : t("dashboard.unlimitedBudget")}
                  </span>
                  {(data.governance.agentsPausedByBudgetCount > 0 ||
                    data.governance.recentBreaches.length > 0) && (
                    <span className="dashboard-governance-hint">
                      {[
                        data.governance.agentsPausedByBudgetCount > 0
                          ? t("dashboard.governanceBudgetPaused", {
                              count: data.governance.agentsPausedByBudgetCount,
                            })
                          : null,
                        data.governance.recentBreaches.length > 0
                          ? t("dashboard.governanceRecentBreaches", {
                              count: data.governance.recentBreaches.length,
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals}
              label={t("dashboard.pendingApprovals")}
              to="/governance"
              description={
                <span>
                  {t("dashboard.awaitingBoardReview")}
                </span>
              }
            />
          </div>

          <div className="dashboard-charts-grid">
            <ChartCard title={t("dashboard.runActivity")} subtitle={t("dashboard.last14Days")}>
              <RunActivityChart runs={runs ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByPriority")} subtitle={t("dashboard.last14Days")}>
              <PriorityChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.issuesByStatus")} subtitle={t("dashboard.last14Days")}>
              <IssueStatusChart issues={issues ?? []} />
            </ChartCard>
            <ChartCard title={t("dashboard.successRate")} subtitle={t("dashboard.last14Days")}>
              <SuccessRateChart runs={runs ?? []} />
            </ChartCard>
          </div>

          {trendData && trendData.series.length > 0 && (
            <div className="dashboard-charts-grid dashboard-trends-grid">
              <ChartCard
                title={t("dashboard.trendsIssueThroughput")}
                subtitle={t("dashboard.trendsDays", { days: trendData.days })}
              >
                <IssueThroughputTrendChart series={trendData.series} />
              </ChartCard>
              <ChartCard
                title={t("dashboard.trendsActiveAgents")}
                subtitle={t("dashboard.trendsDays", { days: trendData.days })}
              >
                <ActiveAgentsTrendChart series={trendData.series} />
              </ChartCard>
              <ChartCard
                title={t("dashboard.trendsGoalIssues")}
                subtitle={t("dashboard.trendsDays", { days: trendData.days })}
              >
                <GoalIssuesTrendChart series={trendData.series} />
              </ChartCard>
            </div>
          )}

          <div className="dashboard-two-col">
            {recentActivity.length > 0 && (
              <div className="dashboard-two-col-cell">
                <PageSection title={t("dashboard.recentActivity")}>
                  <div className="dashboard-panel">
                    {recentActivity.map((event) => (
                      <ActivityRow
                        key={event.id}
                        event={event}
                        agentMap={agentMap}
                        entityNameMap={entityNameMap}
                        entityTitleMap={entityTitleMap}
                        className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                      />
                    ))}
                  </div>
                </PageSection>
              </div>
            )}

            <div className="dashboard-two-col-cell">
              <PageSection title={t("dashboard.recentTasks")}>
                {recentIssues.length === 0 ? (
                  <div className="dashboard-panel-empty">
                    <p className="dashboard-panel-empty-text">{t("dashboard.noTasksYet")}</p>
                  </div>
                ) : (
                  <div className="dashboard-panel">
                    {recentIssues.slice(0, 10).map((issue) => (
                      <DashboardRecentIssueRow
                        key={issue.id}
                        issue={issue}
                        assigneeName={
                          issue.assigneeAgentId ? agentName(issue.assigneeAgentId) : null
                        }
                      />
                    ))}
                  </div>
                )}
              </PageSection>
            </div>
          </div>
            </>
          ) : null}
        </div>

        <aside className="dashboard-layout-aside" aria-label={t("dashboard.agentsSection")}>
          <ActiveAgentsPanel companyId={selectedCompanyId!} />
        </aside>
      </div>
    </div>
  );
}
