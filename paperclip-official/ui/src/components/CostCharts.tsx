import { useTranslation } from "react-i18next";
import type { CostByAgent, CostByBillingCode, CostByRequestDepth } from "@paperclipai/shared";
import type { CostByProject } from "../api/costs";
import { ChartCard } from "./ActivityCharts";
import { formatCents, formatTokens } from "../lib/utils";

const CHART_COLORS = {
  input: "var(--chart-1)",
  output: "var(--chart-2)",
  spend: "var(--chart-3)",
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
    >
      <div className="ui-cost-chart-list" role="list" aria-label={t("tokenUsageByAgent")}>
        {sorted.map((row) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          const name = row.agentName ?? row.agentId;
          const inOut = t("inOutTok", {
            in: formatTokens(row.inputTokens),
            out: formatTokens(row.outputTokens),
          });
          return (
            <div
              key={row.agentId}
              className="ui-cost-chart-row"
              role="listitem"
              aria-label={`${name}, ${inOut}, ${t("totalTokensConsumed")}: ${formatTokens(row.totalTokens)}`}
            >
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
                  aria-hidden="true"
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  aria-hidden="true"
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="ui-cost-chart-value">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ui-cost-chart-footer">
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
        {totalTokenSummary && (
          <div className="ui-cost-chart-total-summary" aria-label={t("totalTokensConsumed")}>
            {totalTokenSummary}
          </div>
        )}
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
    >
      <div className="ui-cost-chart-list" role="list" aria-label={t("tokenUsageByProject")}>
        {sorted.map((row) => {
          const inPct = (row.inputTokens / maxTotal) * 100;
          const outPct = (row.outputTokens / maxTotal) * 100;
          const label = (row.projectName ?? row.projectId ?? t("unattributed")).slice(0, 20);
          const name = row.projectName ?? row.projectId ?? t("unattributed");
          const inOut = t("inOutTok", {
            in: formatTokens(row.inputTokens),
            out: formatTokens(row.outputTokens),
          });
          return (
            <div
              key={row.projectId ?? "na"}
              className="ui-cost-chart-row"
              role="listitem"
              aria-label={`${name}, ${inOut}, ${t("totalTokensConsumed")}: ${formatTokens(row.totalTokens)}`}
            >
              <span
                className="ui-cost-chart-label"
                title={name}
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
                  aria-hidden="true"
                  title={`in: ${formatTokens(row.inputTokens)}`}
                />
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${outPct}%`,
                    minWidth: row.outputTokens > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.output,
                  }}
                  aria-hidden="true"
                  title={`out: ${formatTokens(row.outputTokens)}`}
                />
              </div>
              <span className="ui-cost-chart-value">
                {formatTokens(row.totalTokens)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ui-cost-chart-footer">
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
        {totalTokenSummary && (
          <div className="ui-cost-chart-total-summary" aria-label={t("totalTokensConsumed")}>
            {totalTokenSummary}
          </div>
        )}
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
      <div className="ui-cost-chart-list" role="list" aria-label={t("subscriptionRunsByAgent")}>
        {sorted.slice(0, 12).map((row) => {
          const pct = (row.subscriptionRunCount / maxRuns) * 100;
          const label = (row.agentName ?? row.agentId).slice(0, 20);
          const name = row.agentName ?? row.agentId;
          const runsLabel = t("subscriptionRunsCount", { count: row.subscriptionRunCount });
          return (
            <div
              key={row.agentId}
              className="ui-cost-chart-row"
              role="listitem"
              aria-label={`${name}, ${runsLabel}`}
            >
              <span
                className="ui-cost-chart-label"
                title={name}
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
                  aria-hidden="true"
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

/**
 * 依 billing code 的支出分佈 — 單色橫向條（金額）。
 */
export function SpendByBillingCodeChart({ data }: { data: CostByBillingCode[] }) {
  const { t } = useTranslation("costs");
  const rows = data.filter((r) => r.costCents > 0);
  if (rows.length === 0) {
    return (
      <ChartCard title={t("spendByBillingCode")} subtitle={t("spendByBillingCodeSubtitle")}>
        <p className="ui-cost-chart-empty">{t("noBillingCodeSpendYet")}</p>
      </ChartCard>
    );
  }

  const sorted = [...rows].sort((a, b) => b.costCents - a.costCents);
  const maxCost = Math.max(...sorted.map((r) => r.costCents), 1);

  return (
    <ChartCard title={t("spendByBillingCode")} subtitle={t("spendByBillingCodeSubtitle")}>
      <div className="ui-cost-chart-list" role="list" aria-label={t("spendByBillingCode")}>
        {sorted.map((row) => {
          const pct = (row.costCents / maxCost) * 100;
          const labelText =
            row.billingCode != null && row.billingCode.trim() !== ""
              ? row.billingCode
              : t("billingCodeUnlabeled");
          const label = labelText.slice(0, 24);
          const rowKey =
            row.billingCode === null
              ? "__billing_null__"
              : row.billingCode === ""
                ? "__billing_empty__"
                : row.billingCode;
          return (
            <div
              key={rowKey}
              className="ui-cost-chart-row"
              role="listitem"
              aria-label={`${labelText}, ${formatCents(row.costCents)}`}
            >
              <span className="ui-cost-chart-label" title={labelText}>
                {label}
              </span>
              <div className="ui-cost-chart-bar-wrap">
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${pct}%`,
                    minWidth: row.costCents > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.spend,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span className="ui-cost-chart-value">{formatCents(row.costCents)}</span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

/**
 * 依議題 request_depth 的支出分佈 — 單色橫向條（金額）。
 */
export function SpendByRequestDepthChart({ data }: { data: CostByRequestDepth[] }) {
  const { t } = useTranslation("costs");
  const rows = data.filter((r) => r.costCents > 0);
  if (rows.length === 0) {
    return (
      <ChartCard title={t("spendByRequestDepth")} subtitle={t("spendByRequestDepthSubtitle")}>
        <p className="ui-cost-chart-empty">{t("noRequestDepthSpendYet")}</p>
      </ChartCard>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const aUn = a.requestDepth == null ? 1 : 0;
    const bUn = b.requestDepth == null ? 1 : 0;
    if (aUn !== bUn) return aUn - bUn;
    if (a.requestDepth == null || b.requestDepth == null) return 0;
    return a.requestDepth - b.requestDepth;
  });
  const maxCost = Math.max(...sorted.map((r) => r.costCents), 1);

  return (
    <ChartCard title={t("spendByRequestDepth")} subtitle={t("spendByRequestDepthSubtitle")}>
      <div className="ui-cost-chart-list" role="list" aria-label={t("spendByRequestDepth")}>
        {sorted.map((row) => {
          const pct = (row.costCents / maxCost) * 100;
          const labelText =
            row.requestDepth != null
              ? t("requestDepthLabel", { depth: row.requestDepth })
              : t("requestDepthUnknown");
          const label = labelText.slice(0, 24);
          const key = row.requestDepth != null ? `d-${row.requestDepth}` : "unknown";
          return (
            <div
              key={key}
              className="ui-cost-chart-row"
              role="listitem"
              aria-label={`${labelText}, ${formatCents(row.costCents)}`}
            >
              <span className="ui-cost-chart-label" title={labelText}>
                {label}
              </span>
              <div className="ui-cost-chart-bar-wrap">
                <div
                  className="ui-cost-chart-bar-segment"
                  style={{
                    width: `${pct}%`,
                    minWidth: row.costCents > 0 ? 2 : 0,
                    backgroundColor: CHART_COLORS.spend,
                  }}
                  aria-hidden="true"
                />
              </div>
              <span className="ui-cost-chart-value">{formatCents(row.costCents)}</span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
