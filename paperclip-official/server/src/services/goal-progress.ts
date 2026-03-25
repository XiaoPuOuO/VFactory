import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { costEvents, goals, issues, projectGoals, projects } from "@paperclipai/db";
import type {
  GoalProgress,
  GoalProgressChildGoal,
  GoalProgressIssueStatusCounts,
  GoalProgressProjectRow,
} from "@paperclipai/shared";

import { addIssueStatusCount, emptyIssueStatusCounts } from "./goal-progress-utils.js";

export interface GoalProgressDateRange {
  from?: Date;
  to?: Date;
}

/**
 * 單一 goal 的進度與成本聚合（專案／議題範圍與 GoalDetail「連結專案」一致）。
 */
export async function getGoalProgress(
  db: Db,
  goalId: string,
  range?: GoalProgressDateRange,
): Promise<GoalProgress | null> {
  const goalRow = await db
    .select({
      id: goals.id,
      companyId: goals.companyId,
      title: goals.title,
      status: goals.status,
    })
    .from(goals)
    .where(eq(goals.id, goalId))
    .then((rows) => rows[0] ?? null);
  if (!goalRow) return null;

  const companyId = goalRow.companyId;

  const primaryProjectIds = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.companyId, companyId), eq(projects.goalId, goalId)));

  const junctionProjectIds = await db
    .select({ id: projectGoals.projectId })
    .from(projectGoals)
    .where(and(eq(projectGoals.companyId, companyId), eq(projectGoals.goalId, goalId)));

  const projectIds = [...new Set([...primaryProjectIds.map((r) => r.id), ...junctionProjectIds.map((r) => r.id)])];

  const issueScopeCondition = and(
    eq(issues.companyId, companyId),
    isNull(issues.hiddenAt),
    or(
      eq(issues.goalId, goalId),
      projectIds.length > 0 ? inArray(issues.projectId, projectIds) : sql`false`,
    ),
  );

  const statusRows = await db
    .select({
      status: issues.status,
      count: sql<number>`count(*)::int`,
    })
    .from(issues)
    .where(issueScopeCondition)
    .groupBy(issues.status);

  const issueStatusCounts = emptyIssueStatusCounts();
  let issueTotal = 0;
  for (const row of statusRows) {
    const c = Number(row.count);
    issueTotal += c;
    addIssueStatusCount(issueStatusCounts, row.status, c);
  }

  const issueIdRows = await db
    .select({ id: issues.id })
    .from(issues)
    .where(issueScopeCondition);
  const issueIds = issueIdRows.map((r) => r.id);

  const costOrParts = [
    eq(costEvents.goalId, goalId),
    ...(projectIds.length > 0 ? [inArray(costEvents.projectId, projectIds)] : []),
    ...(issueIds.length > 0 ? [inArray(costEvents.issueId, issueIds)] : []),
  ];
  const costMatch = costOrParts.length === 1 ? costOrParts[0]! : or(...costOrParts);

  const costConditions = [eq(costEvents.companyId, companyId), costMatch];
  if (range?.from) costConditions.push(gte(costEvents.occurredAt, range.from));
  if (range?.to) costConditions.push(lte(costEvents.occurredAt, range.to));

  const [costTotals] = await db
    .select({
      spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)::int`,
    })
    .from(costEvents)
    .where(and(...costConditions));

  const spendCents = Number(costTotals?.spendCents ?? 0);
  const inputTokens = Number(costTotals?.inputTokens ?? 0);
  const outputTokens = Number(costTotals?.outputTokens ?? 0);

  const projectRows =
    projectIds.length === 0
      ? []
      : await db
          .select({
            id: projects.id,
            name: projects.name,
            status: projects.status,
          })
          .from(projects)
          .where(and(eq(projects.companyId, companyId), inArray(projects.id, projectIds)))
          .orderBy(asc(projects.name));

  const perProjectStatus =
    projectIds.length === 0
      ? []
      : await db
          .select({
            projectId: issues.projectId,
            status: issues.status,
            count: sql<number>`count(*)::int`,
          })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              isNull(issues.hiddenAt),
              inArray(issues.projectId, projectIds),
            ),
          )
          .groupBy(issues.projectId, issues.status);

  const projectStatusMap = new Map<string, GoalProgressIssueStatusCounts>();
  for (const pid of projectIds) {
    projectStatusMap.set(pid, emptyIssueStatusCounts());
  }
  for (const row of perProjectStatus) {
    if (!row.projectId) continue;
    const m = projectStatusMap.get(row.projectId);
    if (m) addIssueStatusCount(m, row.status, Number(row.count));
  }

  const projectSpendConditions = [eq(costEvents.companyId, companyId)];
  if (range?.from) projectSpendConditions.push(gte(costEvents.occurredAt, range.from));
  if (range?.to) projectSpendConditions.push(lte(costEvents.occurredAt, range.to));

  const projectSpendRows =
    projectIds.length === 0
      ? []
      : await db
          .select({
            projectId: costEvents.projectId,
            spendCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
          })
          .from(costEvents)
          .where(
            and(
              ...projectSpendConditions,
              inArray(costEvents.projectId, projectIds),
              isNotNull(costEvents.projectId),
            ),
          )
          .groupBy(costEvents.projectId);

  const spendByProject = new Map<string, number>();
  for (const r of projectSpendRows) {
    if (r.projectId) spendByProject.set(r.projectId, Number(r.spendCents));
  }

  const projectsOut: GoalProgressProjectRow[] = projectRows.map((p) => {
    const counts = projectStatusMap.get(p.id) ?? emptyIssueStatusCounts();
    const it = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      projectId: p.id,
      name: p.name,
      status: p.status,
      issueStatusCounts: counts,
      issueTotal: it,
      spendCents: spendByProject.get(p.id) ?? 0,
    };
  });

  const childRows = await db
    .select({
      id: goals.id,
      title: goals.title,
      status: goals.status,
    })
    .from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.parentId, goalId)))
    .orderBy(asc(goals.title));

  const childGoals: GoalProgressChildGoal[] = childRows.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status as GoalProgressChildGoal["status"],
  }));

  return {
    goalId: goalRow.id,
    companyId: goalRow.companyId,
    goalTitle: goalRow.title,
    goalStatus: goalRow.status as GoalProgress["goalStatus"],
    issueStatusCounts,
    issueTotal,
    spendCents,
    inputTokens,
    outputTokens,
    projects: projectsOut,
    childGoals,
  };
}
