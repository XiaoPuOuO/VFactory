import type { CostByAgent } from "@paperclipai/shared";
import type { CostByProject } from "../api/costs";
import { ChartCard } from "./ActivityCharts";
import { formatTokens } from "../lib/utils";

const CHART_COLORS = {
  input: "var(--chart-1)",
  output: "var(--chart-2)",
};

/**
 * Token usage by agent — horizontal stacked bar chart (input / output tokens).
 */
export function TokenUsageByAgentChart({ data }: { data: CostByAgent[] }) {
  if (data.length === 0) {
    return (
      <ChartCard title="Token Usage (By Agent)" subtitle="Input / Output tokens">
        <p className="text-xs text-muted-foreground">No usage data yet.</p>
      </ChartCard>
    );
  }

  const withTotal = data.map((row) => ({
    ...row,
    totalTokens: row.inputTokens + row.outputTokens,
  }));
  const sorted = [...withTotal].sort((a, b) => b.totalTokens - a.totalTokens);
  const maxTotal = Math.max(...sorted.map((r) => r.totalTokens), 1);

  return (
    <ChartCard title="Token Usage (By Agent)" subtitle="Input / Output tokens">
      <div className="space-y-2">
        {sorted.slice(0, 12).map((row, i) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          return (
            <div key={row.agentId} className="flex items-center gap-2 min-h-[24px]">
              <span
                className="text-[10px] text-muted-foreground truncate shrink-0 w-24 tabular-nums"
                title={row.agentName ?? row.agentId}
              >
                {label}
              </span>
              <div className="flex-1 flex h-5 min-w-0 rounded overflow-hidden bg-muted/40">
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: `${inPct}%`,
                    minWidth: row.inputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
        {sorted.length > 12 && (
          <p className="text-[10px] text-muted-foreground pt-1">
            Top 12 of {sorted.length} agents
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-border">
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS.input }} />
          Input tokens
        </span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS.output }} />
          Output tokens
        </span>
      </div>
    </ChartCard>
  );
}

/**
 * Token usage by project — horizontal stacked bar chart (input / output tokens).
 */
export function TokenUsageByProjectChart({ data }: { data: CostByProject[] }) {
  if (data.length === 0) {
    return (
      <ChartCard title="Token Usage (By Project)" subtitle="Input / Output tokens">
        <p className="text-xs text-muted-foreground">No project usage data yet.</p>
      </ChartCard>
    );
  }

  const withTotal = data.map((row) => ({
    ...row,
    totalTokens: row.inputTokens + row.outputTokens,
  }));
  const sorted = [...withTotal].sort((a, b) => b.totalTokens - a.totalTokens);
  const maxTotal = Math.max(...sorted.map((r) => r.totalTokens), 1);

  return (
    <ChartCard title="Token Usage (By Project)" subtitle="Input / Output tokens">
      <div className="space-y-2">
        {sorted.slice(0, 10).map((row) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.projectName ?? row.projectId ?? "Unattributed").slice(0, 20);
          return (
            <div key={row.projectId ?? "na"} className="flex items-center gap-2 min-h-[24px]">
              <span
                className="text-[10px] text-muted-foreground truncate shrink-0 w-24 tabular-nums"
                title={row.projectName ?? row.projectId ?? "Unattributed"}
              >
                {label}
              </span>
              <div className="flex-1 flex h-5 min-w-0 rounded overflow-hidden bg-muted/40">
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: `${inPct}%`,
                    minWidth: row.inputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="h-full transition-[width] duration-200"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
        {sorted.length > 10 && (
          <p className="text-[10px] text-muted-foreground pt-1">
            Top 10 of {sorted.length} projects
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-2 border-t border-border">
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS.input }} />
          Input tokens
        </span>
        <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS.output }} />
          Output tokens
        </span>
      </div>
    </ChartCard>
  );
}

/**
 * Subscription runs by agent — horizontal bar chart.
 */
export function SubscriptionRunsByAgentChart({ data }: { data: CostByAgent[] }) {
  const withRuns = data.filter((r) => r.subscriptionRunCount > 0);
  if (withRuns.length === 0) {
    return (
      <ChartCard title="Subscription Runs (By Agent)" subtitle="Subscription runs">
        <p className="text-xs text-muted-foreground">No subscription run data yet.</p>
      </ChartCard>
    );
  }

  const sorted = [...withRuns].sort((a, b) => b.subscriptionRunCount - a.subscriptionRunCount);
  const maxRuns = Math.max(...sorted.map((r) => r.subscriptionRunCount), 1);

  return (
    <ChartCard title="Subscription Runs (By Agent)" subtitle="Subscription runs">
      <div className="space-y-2">
        {sorted.slice(0, 12).map((row) => {
          const pct = (row.subscriptionRunCount / maxRuns) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          return (
            <div key={row.agentId} className="flex items-center gap-2 min-h-[24px]">
              <span
                className="text-[10px] text-muted-foreground truncate shrink-0 w-24"
                title={row.agentName ?? row.agentId}
              >
                {label}
              </span>
              <div className="flex-1 h-5 min-w-0 rounded overflow-hidden bg-muted/40">
                <div
                  className="h-full rounded transition-[width] duration-200"
                  style={{
                    width: `${pct}%`,
                    minWidth: row.subscriptionRunCount > 0 ? 4 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`${row.subscriptionRunCount} runs`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                {row.subscriptionRunCount}
              </span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
