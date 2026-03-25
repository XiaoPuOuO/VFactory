import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { assetsApi } from "../api/assets";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalProperties } from "../components/GoalProperties";
import { GoalTree } from "../components/GoalTree";
import { StatusBadge } from "../components/StatusBadge";
import { InlineEditor } from "../components/InlineEditor";
import { EntityRow } from "../components/EntityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatTokens, projectUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import "./GoalDetail.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { ISSUE_STATUSES, type Goal, type GoalProgressIssueStatusCounts } from "@paperclipai/shared";
import { ApiError } from "../api/client";
import { useToast } from "../context/ToastContext";

function issueStatusSummaryLine(
  counts: GoalProgressIssueStatusCounts,
  tStatus: (key: string) => string,
): string {
  const parts: string[] = [];
  for (const s of ISSUE_STATUSES) {
    const n = counts[s];
    if (n > 0) parts.push(`${tStatus(s)} ${n}`);
  }
  return parts.join(" · ");
}

export function GoalDetail() {
  const { t } = useTranslation(["goals", "project"]);
  const { t: tStatus } = useTranslation("status");
  const { goalId } = useParams<{ goalId: string }>();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { openPanel, closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [costPreset, setCostPreset] = useState<"mtd" | "all">("mtd");
  const { pushToast } = useToast();

  const {
    data: goal,
    isLoading,
    error
  } = useQuery({
    queryKey: queryKeys.goals.detail(goalId!),
    queryFn: () => goalsApi.get(goalId!),
    enabled: !!goalId
  });
  const resolvedCompanyId = goal?.companyId ?? selectedCompanyId;

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(resolvedCompanyId!),
    queryFn: () => goalsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects.list(resolvedCompanyId!),
    queryFn: () => projectsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  const progressRange = useMemo(() => {
    if (costPreset === "all") return undefined;
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }, [costPreset]);

  const { data: goalProgress, isLoading: progressLoading } = useQuery({
    queryKey: queryKeys.goals.progress(goalId!, costPreset),
    queryFn: () => goalsApi.getProgress(goalId!, progressRange),
    enabled: !!goalId && !!resolvedCompanyId
  });

  const displayGoalStatus = useMemo(() => {
    if (!goal || !goalProgress) return goal?.status ?? null;
    if (goal.recurrence === "one_time") return goal.status;
    if (goal.status === "cancelled") return goal.status;
    // 定期目標：當相關 issues 全部位於 terminal 狀態（done/cancelled）時，視覺上標記為已完成。
    if (goalProgress.issueTotal <= 0) return goal.status;
    const nonTerminalStatuses = ISSUE_STATUSES.filter((s) => s !== "done" && s !== "cancelled");
    const hasNonTerminal = nonTerminalStatuses.some((s) => (goalProgress.issueStatusCounts[s] ?? 0) > 0);
    return hasNonTerminal ? goal.status : "achieved";
  }, [goal, goalProgress]);

  useEffect(() => {
    if (!goal?.companyId || goal.companyId === selectedCompanyId) return;
    setSelectedCompanyId(goal.companyId, { source: "route_sync" });
  }, [goal?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const updateGoal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      goalsApi.update(goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.goals.detail(goalId!)
      });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(resolvedCompanyId)
        });
      }
      queryClient.invalidateQueries({
        queryKey: ["goals", "progress", goalId]
      });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        pushToast({
          title: t("error"),
          body: typeof err.message === "string" ? err.message : "Failed to update goal.",
          tone: "error",
        });
        return;
      }
      pushToast({
        title: t("error"),
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(
        resolvedCompanyId,
        file,
        `goals/${goalId ?? "draft"}`
      );
    }
  });

  const childGoals = (allGoals ?? []).filter((g) => g.parentId === goalId);
  const linkedProjects = (allProjects ?? []).filter((p) => {
    if (!goalId) return false;
    if (p.goalIds.includes(goalId)) return true;
    if (p.goals.some((goalRef) => goalRef.id === goalId)) return true;
    return p.goalId === goalId;
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("pageTitle"), href: "/goals" },
      { label: goal?.title ?? goalId ?? t("goal") }
    ]);
  }, [setBreadcrumbs, goal, goalId, t]);

  useEffect(() => {
    if (goal) {
      openPanel(
        <GoalProperties
          goal={goal}
          onUpdate={(data) => updateGoal.mutate(data)}
        />
      );
    }
    return () => closePanel();
  }, [goal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="goal-detail-error">{error.message}</p>;
  if (!goal) return null;

  return (
    <div className="goal-detail-page">
      <div className="goal-detail-meta">
        <div className="goal-detail-meta-row">
          <span className="goal-detail-level">{goal.level}</span>
          {displayGoalStatus ? <StatusBadge status={displayGoalStatus} /> : null}
        </div>

        <InlineEditor
          value={goal.title}
          onSave={(title) => updateGoal.mutate({ title })}
          as="h2"
          className="goal-detail-title"
        />

        <InlineEditor
          value={goal.description ?? ""}
          onSave={(description) => updateGoal.mutate({ description })}
          as="p"
          className="goal-detail-desc"
          placeholder="Add a description..."
          multiline
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      </div>

      <Tabs defaultValue="children">
        <TabsList>
          <TabsTrigger value="children">
            {t("subGoalsWithCount", { count: childGoals.length })}
          </TabsTrigger>
          <TabsTrigger value="projects">
            {t("project:projectsWithCount", { count: linkedProjects.length })}
          </TabsTrigger>
          <TabsTrigger value="progress">{t("progressTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="children" className="goal-detail-tabs-content">
          <div className="goal-detail-toolbar">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openNewGoal({ parentId: goalId })}
              className="goal-detail-toolbar-btn"
            >
              <Plus />
              {t("subGoal")}
            </Button>
          </div>
          {childGoals.length === 0 ? (
            <p className="goal-detail-empty">{t("noSubGoals")}</p>
          ) : (
            <GoalTree goals={childGoals} goalLink={(g) => `/goals/${g.id}`} />
          )}
        </TabsContent>

        <TabsContent value="projects" className="goal-detail-tabs-content projects">
          {linkedProjects.length === 0 ? (
            <p className="goal-detail-empty">{t("project:noLinkedProjects")}</p>
          ) : (
            <div className="goal-detail-projects-list">
              {linkedProjects.map((project) => (
                <EntityRow
                  key={project.id}
                  title={project.name}
                  subtitle={project.description ?? undefined}
                  to={projectUrl(project)}
                  trailing={<StatusBadge status={project.status} />}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="progress" className="goal-detail-tabs-content goal-detail-progress">
          <div className="goal-detail-progress-toolbar">
            <span className="goal-detail-progress-toolbar-label">{t("costPeriod")}</span>
            <div className="goal-detail-progress-toolbar-actions">
              <Button
                type="button"
                size="sm"
                variant={costPreset === "mtd" ? "default" : "outline"}
                onClick={() => setCostPreset("mtd")}
              >
                {t("costPeriodMtd")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={costPreset === "all" ? "default" : "outline"}
                onClick={() => setCostPreset("all")}
              >
                {t("costPeriodAll")}
              </Button>
            </div>
          </div>

          {progressLoading ? (
            <p className="goal-detail-empty">{t("progressLoading")}</p>
          ) : !goalProgress ? (
            <p className="goal-detail-empty">{t("progressEmpty")}</p>
          ) : (
            <>
              <div className="goal-detail-progress-summary">
                <div className="goal-detail-progress-stat">
                  <span className="goal-detail-progress-stat-label">{t("totalSpend")}</span>
                  <span className="goal-detail-progress-stat-value">{formatCents(goalProgress.spendCents)}</span>
                </div>
                <div className="goal-detail-progress-stat">
                  <span className="goal-detail-progress-stat-label">{t("totalTokens")}</span>
                  <span className="goal-detail-progress-stat-value">
                    {formatTokens(goalProgress.inputTokens + goalProgress.outputTokens)}
                  </span>
                </div>
                <div className="goal-detail-progress-stat goal-detail-progress-stat-wide">
                  <span className="goal-detail-progress-stat-label">{t("issuesByStatus")}</span>
                  <span className="goal-detail-progress-stat-meta">
                    {issueStatusSummaryLine(goalProgress.issueStatusCounts, tStatus) || t("noIssuesInScope")}
                  </span>
                </div>
              </div>

              {goalProgress.childGoals.length > 0 ? (
                <section className="goal-detail-progress-section" aria-labelledby="goal-progress-subgoals-heading">
                  <h3 id="goal-progress-subgoals-heading" className="goal-detail-progress-section-title">
                    {t("subGoalsDrillDown")}
                  </h3>
                  <ul className="goal-detail-progress-subgoal-list">
                    {goalProgress.childGoals.map((cg) => (
                      <li key={cg.id}>
                        <Link className="goal-detail-progress-subgoal-link" to={`/goals/${cg.id}`}>
                          <span className="goal-detail-progress-subgoal-title">{cg.title}</span>
                          <StatusBadge status={cg.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="goal-detail-progress-section" aria-labelledby="goal-progress-projects-heading">
                <h3 id="goal-progress-projects-heading" className="goal-detail-progress-section-title">
                  {t("linkedProjectsProgress", { count: goalProgress.projects.length })}
                </h3>
                {goalProgress.projects.length === 0 ? (
                  <p className="goal-detail-empty">{t("noProjectsInProgress")}</p>
                ) : (
                  <div className="goal-detail-progress-projects-list">
                    {goalProgress.projects.map((p) => (
                      <EntityRow
                        key={p.projectId}
                        title={p.name}
                        subtitle={
                          issueStatusSummaryLine(p.issueStatusCounts, tStatus) ||
                          t("noIssuesInProject")
                        }
                        to={projectUrl({ id: p.projectId, name: p.name, urlKey: null })}
                        trailing={
                          <span className="goal-detail-progress-project-trailing">
                            <StatusBadge status={p.status} />
                            <span className="goal-detail-progress-project-spend">{formatCents(p.spendCents)}</span>
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
