import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  approvals,
  companies,
  costEvents,
  heartbeatRuns,
  issues,
  limitBreachEvents,
} from "@paperclipai/db";
import { notFound } from "../errors.js";

const DASHBOARD_BREACH_LOOKBACK_DAYS = 30;
const DASHBOARD_BREACH_LIMIT = 8;
const DASHBOARD_TRENDS_MAX_DAYS = 90;

function utcDayLabels(numDays: number): { startUtc: Date; labels: string[] } {
  const capped = Math.min(DASHBOARD_TRENDS_MAX_DAYS, Math.max(1, Math.floor(numDays)));
  const now = new Date();
  const labels: string[] = [];
  for (let i = capped - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    labels.push(d.toISOString().slice(0, 10));
  }
  const startUtc = new Date(`${labels[0]}T00:00:00.000Z`);
  return { startUtc, labels };
}

export function dashboardService(db: Db) {
  return {
    summary: async (companyId: string) => {
      const company = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);

      if (!company) throw notFound("Company not found");

      const agentRows = await db
        .select({ status: agents.status, count: sql<number>`count(*)` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .groupBy(agents.status);

      const taskRows = await db
        .select({ status: issues.status, count: sql<number>`count(*)` })
        .from(issues)
        .where(eq(issues.companyId, companyId))
        .groupBy(issues.status);

      const pendingApprovals = await db
        .select({ count: sql<number>`count(*)` })
        .from(approvals)
        .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
        .then((rows) => Number(rows[0]?.count ?? 0));

      const agentCounts: Record<string, number> = {
        active: 0,
        running: 0,
        paused: 0,
        error: 0,
      };
      for (const row of agentRows) {
        const count = Number(row.count);
        // "idle" agents are operational — count them as active
        const bucket = row.status === "idle" ? "active" : row.status;
        agentCounts[bucket] = (agentCounts[bucket] ?? 0) + count;
      }

      const taskCounts: Record<string, number> = {
        open: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
      };
      for (const row of taskRows) {
        const count = Number(row.count);
        if (row.status === "in_progress") taskCounts.inProgress += count;
        if (row.status === "blocked") taskCounts.blocked += count;
        if (row.status === "done") taskCounts.done += count;
        if (row.status !== "done" && row.status !== "cancelled") taskCounts.open += count;
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [{ monthSpend }] = await db
        .select({
          monthSpend: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::int`,
        })
        .from(costEvents)
        .where(
          and(
            eq(costEvents.companyId, companyId),
            gte(costEvents.occurredAt, monthStart),
          ),
        );

      const monthSpendCents = Number(monthSpend);
      const utilization =
        company.budgetMonthlyCents > 0
          ? (monthSpendCents / company.budgetMonthlyCents) * 100
          : 0;

      const breachFrom = new Date();
      breachFrom.setDate(breachFrom.getDate() - DASHBOARD_BREACH_LOOKBACK_DAYS);

      const [{ budgetPausedCount }] = await db
        .select({
          budgetPausedCount: sql<number>`count(*)::int`,
        })
        .from(agents)
        .where(
          and(
            eq(agents.companyId, companyId),
            eq(agents.status, "paused"),
            inArray(agents.autoPauseReason, ["budget_limit", "budget_policy"]),
          ),
        );

      const breachRows = await db
        .select()
        .from(limitBreachEvents)
        .where(
          and(
            eq(limitBreachEvents.companyId, companyId),
            gte(limitBreachEvents.occurredAt, breachFrom),
          ),
        )
        .orderBy(desc(limitBreachEvents.occurredAt))
        .limit(DASHBOARD_BREACH_LIMIT);

      const recentBreaches = breachRows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        type: r.type as
          | "budget_breach"
          | "token_limit_breach"
          | "price_limit_breach"
          | "budget_policy_breach",
        occurredAt: r.occurredAt,
        amountCents: r.amountCents,
        tokenUsage: r.tokenUsage != null ? Number(r.tokenUsage) : null,
        agentId: r.agentId,
        details: (r.details as Record<string, unknown>) ?? null,
        createdAt: r.createdAt,
      }));

      return {
        companyId,
        agents: {
          active: agentCounts.active,
          running: agentCounts.running,
          paused: agentCounts.paused,
          error: agentCounts.error,
        },
        tasks: taskCounts,
        costs: {
          monthSpendCents,
          monthBudgetCents: company.budgetMonthlyCents,
          monthUtilizationPercent: Number(utilization.toFixed(2)),
        },
        governance: {
          agentsPausedByBudgetCount: Number(budgetPausedCount ?? 0),
          recentBreaches,
        },
        pendingApprovals,
      };
    },

    trends: async (companyId: string, days: number) => {
      const company = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      if (!company) throw notFound("Company not found");

      const { startUtc, labels } = utcDayLabels(days);
      const now = new Date();

      const issueDay = sql<string>`to_char(${issues.updatedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
      const issueCreatedDay = sql<string>`to_char(${issues.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
      const runDay = sql<string>`to_char(${heartbeatRuns.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

      const completedRows = await db
        .select({
          day: issueDay,
          n: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            gte(issues.updatedAt, startUtc),
            lte(issues.updatedAt, now),
          ),
        )
        .groupBy(issueDay);

      const createdRows = await db
        .select({
          day: issueCreatedDay,
          n: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), gte(issues.createdAt, startUtc)))
        .groupBy(issueCreatedDay);

      const goalDoneRows = await db
        .select({
          day: issueDay,
          n: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            isNotNull(issues.goalId),
            gte(issues.updatedAt, startUtc),
            lte(issues.updatedAt, now),
          ),
        )
        .groupBy(issueDay);

      const agentRows = await db
        .select({
          day: runDay,
          n: sql<number>`count(distinct ${heartbeatRuns.agentId})::int`,
        })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, startUtc)))
        .groupBy(runDay);

      const mapFrom = (rows: { day: string; n: number }[]) => {
        const m = new Map<string, number>();
        for (const r of rows) {
          m.set(r.day, Number(r.n));
        }
        return m;
      };

      const completedMap = mapFrom(completedRows as { day: string; n: number }[]);
      const createdMap = mapFrom(createdRows as { day: string; n: number }[]);
      const goalDoneMap = mapFrom(goalDoneRows as { day: string; n: number }[]);
      const agentMap = mapFrom(agentRows as { day: string; n: number }[]);

      const series = labels.map((date) => ({
        date,
        issuesCreated: createdMap.get(date) ?? 0,
        issuesCompleted: completedMap.get(date) ?? 0,
        activeAgents: agentMap.get(date) ?? 0,
        goalLinkedIssuesCompleted: goalDoneMap.get(date) ?? 0,
      }));

      return {
        companyId,
        days: labels.length,
        series,
      };
    },
  };
}
