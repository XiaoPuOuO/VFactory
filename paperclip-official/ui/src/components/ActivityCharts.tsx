import { useTranslation } from "react-i18next";
import type { DashboardTrendsDay, HeartbeatRun } from "@paperclipai/shared";

/* ---- Utilities ---- */

export function getLast14Days(): string[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---- Sub-components ---- */

function DateLabels({ days }: { days: string[] }) {
  return (
    <div className="dashboard-chart-dates">
      {days.map((day, i) => (
        <div key={day} className="dashboard-chart-date-cell">
          {(i === 0 || i === 6 || i === 13) ? (
            <span className="dashboard-chart-date-label">{formatDayLabel(day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="dashboard-chart-legend">
      {items.map(item => (
        <span key={item.label} className="dashboard-chart-legend-item">
          <span className="dashboard-chart-legend-dot" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  titleRight,
  children,
}: {
  title: string;
  subtitle?: string;
  /** 標題右側的小字（例如總消耗 token），會以灰色小字顯示 */
  titleRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-chart-card">
      <div className="dashboard-chart-card-header">
        <div>
          <h3 className="dashboard-chart-card-title">{title}</h3>
          {subtitle && <span className="dashboard-chart-card-subtitle">{subtitle}</span>}
        </div>
        {titleRight != null && (
          <span className="dashboard-chart-card-right">{titleRight}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ---- Chart Components ---- */

export function RunActivityChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();

  const grouped = new Map<string, { succeeded: number; failed: number; other: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, failed: 0, other: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (run.status === "succeeded") entry.succeeded++;
    else if (run.status === "failed" || run.status === "timed_out") entry.failed++;
    else entry.other++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => v.succeeded + v.failed + v.other), 1);
  const hasData = Array.from(grouped.values()).some(v => v.succeeded + v.failed + v.other > 0);

  if (!hasData) return <p className="dashboard-chart-card-subtitle">No runs yet</p>;

  return (
    <div>
      <div className="dashboard-chart-bars">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = entry.succeeded + entry.failed + entry.other;
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="dashboard-chart-bar-cell" title={`${day}: ${total} runs`}>
              {total > 0 ? (
                <div className="dashboard-chart-bar-stack" style={{ height: `${heightPct}%` }}>
                  {entry.succeeded > 0 && <div style={{ flex: entry.succeeded, backgroundColor: "#10b981" }} />}
                  {entry.failed > 0 && <div style={{ flex: entry.failed, backgroundColor: "#ef4444" }} />}
                  {entry.other > 0 && <div style={{ flex: entry.other, backgroundColor: "#737373" }} />}
                </div>
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

const priorityColors: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

const priorityOrder = ["critical", "high", "medium", "low"] as const;

const PRIORITY_LABEL_KEYS: Record<string, string> = {
  critical: "dashboard.priorityCritical",
  high: "dashboard.priorityHigh",
  medium: "dashboard.priorityMedium",
  low: "dashboard.priorityLow",
};

export function PriorityChart({ issues }: { issues: { priority: string; createdAt: Date }[] }) {
  const { t } = useTranslation();
  const days = getLast14Days();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, { critical: 0, high: 0, medium: 0, low: 0 });
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    if (issue.priority in entry) entry[issue.priority]++;
  }

  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = Array.from(grouped.values()).some(v => Object.values(v).reduce((a, b) => a + b, 0) > 0);

  if (!hasData) return <p className="dashboard-chart-card-subtitle">No issues</p>;

  return (
    <div>
      <div className="dashboard-chart-bars">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="dashboard-chart-bar-cell" title={`${day}: ${total} issues`}>
              {total > 0 ? (
                <div className="dashboard-chart-bar-stack" style={{ height: `${heightPct}%` }}>
                  {priorityOrder.map(p => entry[p] > 0 ? (
                    <div key={p} style={{ flex: entry[p], backgroundColor: priorityColors[p] }} />
                  ) : null)}
                </div>
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={priorityOrder.map(p => ({ color: priorityColors[p], label: t(PRIORITY_LABEL_KEYS[p]) }))} />
    </div>
  );
}

const statusColors: Record<string, string> = {
  todo: "#3b82f6",
  in_progress: "#8b5cf6",
  in_review: "#a855f7",
  done: "#10b981",
  blocked: "#ef4444",
  cancelled: "#6b7280",
  backlog: "#64748b",
};

/** API 狀態值對應 status namespace 的 key（snake_case -> camelCase）。 */
const STATUS_LABEL_KEYS: Record<string, string> = {
  todo: "status.todo",
  in_progress: "status.inProgress",
  in_review: "status.inReview",
  done: "status.done",
  blocked: "status.blocked",
  cancelled: "status.cancelled",
  backlog: "status.backlog",
};

export function IssueStatusChart({ issues }: { issues: { status: string; createdAt: Date }[] }) {
  const { t } = useTranslation();
  const days = getLast14Days();
  const allStatuses = new Set<string>();
  const grouped = new Map<string, Record<string, number>>();
  for (const day of days) grouped.set(day, {});
  for (const issue of issues) {
    const day = new Date(issue.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry[issue.status] = (entry[issue.status] ?? 0) + 1;
    allStatuses.add(issue.status);
  }

  const statusOrder = ["todo", "in_progress", "in_review", "done", "blocked", "cancelled", "backlog"].filter(s => allStatuses.has(s));
  const maxValue = Math.max(...Array.from(grouped.values()).map(v => Object.values(v).reduce((a, b) => a + b, 0)), 1);
  const hasData = allStatuses.size > 0;

  if (!hasData) return <p className="dashboard-chart-card-subtitle">No issues</p>;

  return (
    <div>
      <div className="dashboard-chart-bars">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const total = Object.values(entry).reduce((a, b) => a + b, 0);
          const heightPct = (total / maxValue) * 100;
          return (
            <div key={day} className="dashboard-chart-bar-cell" title={`${day}: ${total} issues`}>
              {total > 0 ? (
                <div className="dashboard-chart-bar-stack" style={{ height: `${heightPct}%` }}>
                  {statusOrder.map(s => (entry[s] ?? 0) > 0 ? (
                    <div key={s} style={{ flex: entry[s], backgroundColor: statusColors[s] ?? "#6b7280" }} />
                  ) : null)}
                </div>
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend items={statusOrder.map(s => ({
        color: statusColors[s] ?? "#6b7280",
        label: STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s,
      }))} />
    </div>
  );
}

const TREND_CREATED = "#3b82f6";
const TREND_COMPLETED = "#10b981";
const TREND_AGENTS = "#8b5cf6";
const TREND_GOAL = "#f97316";

export function IssueThroughputTrendChart({ series }: { series: DashboardTrendsDay[] }) {
  const { t } = useTranslation();
  const days = series.map((s) => s.date);
  const maxValue = Math.max(
    ...series.map((s) => s.issuesCreated + s.issuesCompleted),
    1,
  );
  const hasData = series.some((s) => s.issuesCreated + s.issuesCompleted > 0);
  if (!hasData) {
    return <p className="dashboard-chart-card-subtitle">{t("dashboard.trendsEmpty")}</p>;
  }
  return (
    <div>
      <div className="dashboard-chart-bars">
        {series.map((row) => {
          const total = row.issuesCreated + row.issuesCompleted;
          const heightPct = (total / maxValue) * 100;
          return (
            <div
              key={row.date}
              className="dashboard-chart-bar-cell"
              title={`${row.date}: +${row.issuesCreated} / ✓${row.issuesCompleted}`}
            >
              {total > 0 ? (
                <div className="dashboard-chart-bar-stack" style={{ height: `${heightPct}%` }}>
                  {row.issuesCreated > 0 && (
                    <div style={{ flex: row.issuesCreated, backgroundColor: TREND_CREATED }} />
                  )}
                  {row.issuesCompleted > 0 && (
                    <div style={{ flex: row.issuesCompleted, backgroundColor: TREND_COMPLETED }} />
                  )}
                </div>
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
      <ChartLegend
        items={[
          { color: TREND_CREATED, label: t("dashboard.trendsLegendCreated") },
          { color: TREND_COMPLETED, label: t("dashboard.trendsLegendCompleted") },
        ]}
      />
    </div>
  );
}

export function ActiveAgentsTrendChart({ series }: { series: DashboardTrendsDay[] }) {
  const { t } = useTranslation();
  const days = series.map((s) => s.date);
  const maxValue = Math.max(...series.map((s) => s.activeAgents), 1);
  const hasData = series.some((s) => s.activeAgents > 0);
  if (!hasData) {
    return <p className="dashboard-chart-card-subtitle">{t("dashboard.trendsEmpty")}</p>;
  }
  return (
    <div>
      <div className="dashboard-chart-bars">
        {series.map((row) => {
          const heightPct = (row.activeAgents / maxValue) * 100;
          return (
            <div
              key={row.date}
              className="dashboard-chart-bar-cell"
              title={`${row.date}: ${row.activeAgents} agents`}
            >
              {row.activeAgents > 0 ? (
                <div
                  style={{
                    height: `${heightPct}%`,
                    minHeight: 2,
                    backgroundColor: TREND_AGENTS,
                  }}
                />
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

export function GoalIssuesTrendChart({ series }: { series: DashboardTrendsDay[] }) {
  const { t } = useTranslation();
  const days = series.map((s) => s.date);
  const maxValue = Math.max(...series.map((s) => s.goalLinkedIssuesCompleted), 1);
  const hasData = series.some((s) => s.goalLinkedIssuesCompleted > 0);
  if (!hasData) {
    return <p className="dashboard-chart-card-subtitle">{t("dashboard.trendsEmpty")}</p>;
  }
  return (
    <div>
      <div className="dashboard-chart-bars">
        {series.map((row) => {
          const heightPct = (row.goalLinkedIssuesCompleted / maxValue) * 100;
          return (
            <div
              key={row.date}
              className="dashboard-chart-bar-cell"
              title={`${row.date}: ${row.goalLinkedIssuesCompleted}`}
            >
              {row.goalLinkedIssuesCompleted > 0 ? (
                <div
                  style={{
                    height: `${heightPct}%`,
                    minHeight: 2,
                    backgroundColor: TREND_GOAL,
                  }}
                />
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}

export function SuccessRateChart({ runs }: { runs: HeartbeatRun[] }) {
  const days = getLast14Days();
  const grouped = new Map<string, { succeeded: number; total: number }>();
  for (const day of days) grouped.set(day, { succeeded: 0, total: 0 });
  for (const run of runs) {
    const day = new Date(run.createdAt).toISOString().slice(0, 10);
    const entry = grouped.get(day);
    if (!entry) continue;
    entry.total++;
    if (run.status === "succeeded") entry.succeeded++;
  }

  const hasData = Array.from(grouped.values()).some(v => v.total > 0);
  if (!hasData) return <p className="dashboard-chart-card-subtitle">No runs yet</p>;

  return (
    <div>
      <div className="dashboard-chart-bars">
        {days.map(day => {
          const entry = grouped.get(day)!;
          const rate = entry.total > 0 ? entry.succeeded / entry.total : 0;
          const color = entry.total === 0 ? undefined : rate >= 0.8 ? "#10b981" : rate >= 0.5 ? "#eab308" : "#ef4444";
          return (
            <div key={day} className="dashboard-chart-bar-cell" title={`${day}: ${entry.total > 0 ? Math.round(rate * 100) : 0}% (${entry.succeeded}/${entry.total})`}>
              {entry.total > 0 ? (
                <div style={{ height: `${rate * 100}%`, minHeight: 2, backgroundColor: color ?? "transparent" }} />
              ) : (
                <div className="dashboard-chart-bar-empty" />
              )}
            </div>
          );
        })}
      </div>
      <DateLabels days={days} />
    </div>
  );
}
