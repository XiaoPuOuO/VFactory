import { useTranslation } from "react-i18next";
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
 * @param totalTokenSummary - 可選，顯示在標題右側的總消耗小字（依時間範圍）
 */
export function TokenUsageByAgentChart({
  data,
  totalTokenSummary,
}: {
  data: CostByAgent[];
  totalTokenSummary?: string;
}) {
  const { t } = useTranslation("costs");

  if (data.length === 0) {
    return (
      <ChartCard
        title={t("tokenUsageByAgent")}
        subtitle={t("inputOutputTokens")}
        titleRight={totalTokenSummary}
      >
        <p className="ui-cost-chart-empty">{t("noUsageDataYet")}</p>
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
    <ChartCard
      title={t("tokenUsageByAgent")}
      subtitle={t("inputOutputTokens")}
      titleRight={totalTokenSummary}
    >
      <div className="ui-cost-chart-list">
        {sorted.slice(0, 12).map((row) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          return (
            <div key={row.agentId} className="ui-cost-chart-row">
              <span
                className="ui-cost-chart-label"
                title={row.agentName ?? row.agentId}
              >
                {label}
              </span>
              <div className="ui-cost-chart-bar-wrap">
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${inPct}%`,
                    minWidth: row.inputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="ui-cost-chart-value">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
        {sorted.length > 12 && (
          <p className="ui-cost-chart-footnote">
            {t("topOfAgents", { top: 12, total: sorted.length })}
          </p>
        )}
      </div>
      <div className="ui-cost-chart-legend">
        <span className="ui-cost-chart-legend-item">
          <span className="ui-cost-chart-legend-dot" style={{ backgroundColor: CHART_COLORS.input }} />
          {t("inputTokens")}
        </span>
        <span className="ui-cost-chart-legend-item">
          <span className="ui-cost-chart-legend-dot" style={{ backgroundColor: CHART_COLORS.output }} />
          {t("outputTokens")}
        </span>
      </div>
    </ChartCard>
  );
}

/**
 * Token usage by project — horizontal stacked bar chart (input / output tokens).
 * @param totalTokenSummary - 可選，顯示在標題右側的總消耗小字（依時間範圍）
 */
export function TokenUsageByProjectChart({
  data,
  totalTokenSummary,
}: {
  data: CostByProject[];
  totalTokenSummary?: string;
}) {
  const { t } = useTranslation("costs");

  if (data.length === 0) {
    return (
      <ChartCard
        title={t("tokenUsageByProject")}
        subtitle={t("inputOutputTokens")}
        titleRight={totalTokenSummary}
      >
        <p className="ui-cost-chart-empty">{t("noProjectUsageDataYet")}</p>
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
    <ChartCard
      title={t("tokenUsageByProject")}
      subtitle={t("inputOutputTokens")}
      titleRight={totalTokenSummary}
    >
      <div className="ui-cost-chart-list">
        {sorted.slice(0, 10).map((row) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.projectName ?? row.projectId ?? t("unattributed")).slice(0, 20);
          return (
            <div key={row.projectId ?? "na"} className="ui-cost-chart-row">
              <span
                className="ui-cost-chart-label"
                title={row.projectName ?? row.projectId ?? t("unattributed")}
              >
                {label}
              </span>
              <div className="ui-cost-chart-bar-wrap">
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${inPct}%`,
                    minWidth: row.inputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="ui-cost-chart-value">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
        {sorted.length > 10 && (
          <p className="ui-cost-chart-footnote">
            {t("topOfProjects", { top: 10, total: sorted.length })}
          </p>
        )}
      </div>
      <div className="ui-cost-chart-legend">
        <span className="ui-cost-chart-legend-item">
          <span className="ui-cost-chart-legend-dot" style={{ backgroundColor: CHART_COLORS.input }} />
          {t("inputTokens")}
        </span>
        <span className="ui-cost-chart-legend-item">
          <span className="ui-cost-chart-legend-dot" style={{ backgroundColor: CHART_COLORS.output }} />
          {t("outputTokens")}
        </span>
      </div>
    </ChartCard>
  );
}

/**
 * Subscription runs by agent — horizontal bar chart.
 */
export function SubscriptionRunsByAgentChart({ data }: { data: CostByAgent[] }) {
  const { t } = useTranslation("costs");
  const withRuns = data.filter((r) => r.subscriptionRunCount > 0);
  if (withRuns.length === 0) {
    return (
      <ChartCard title={t("subscriptionRunsByAgent")} subtitle={t("subscriptionRuns")}>
        <p className="ui-cost-chart-empty">{t("noSubscriptionRunDataYet")}</p>
      </ChartCard>
    );
  }

  const sorted = [...withRuns].sort((a, b) => b.subscriptionRunCount - a.subscriptionRunCount);
  const maxRuns = Math.max(...sorted.map((r) => r.subscriptionRunCount), 1);

  return (
    <ChartCard title={t("subscriptionRunsByAgent")} subtitle={t("subscriptionRuns")}>
      <div className="ui-cost-chart-list">
        {sorted.slice(0, 12).map((row) => {
          const pct = (row.subscriptionRunCount / maxRuns) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          return (
            <div key={row.agentId} className="ui-cost-chart-row">
              <span
                className="ui-cost-chart-label"
                title={row.agentName ?? row.agentId}
              >
                {label}
              </span>
              <div className="ui-cost-chart-bar-wrap">
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${pct}%`,
                    minWidth: row.subscriptionRunCount > 0 ? 4 : 0,
                    backgroundColor: CHART_COLORS.input,
                  }}
                  title={`${row.subscriptionRunCount} runs`}
                />
              </div>
              <span className="ui-cost-chart-value narrow">
                {row.subscriptionRunCount}
              </span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
