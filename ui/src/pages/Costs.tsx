import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatCents, formatTokens } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
import {
  TokenUsageByAgentChart,
  TokenUsageByProjectChart,
  SubscriptionRunsByAgentChart,
} from "../components/CostCharts";
import "./Costs.css";

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";

const PRESET_KEYS: Record<DatePreset, string> = {
  mtd: "mtd",
  "7d": "last7Days",
  "30d": "last30Days",
  ytd: "ytd",
  all: "allTime",
  custom: "custom",
};

function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
      return { from: "", to: "" };
    case "custom":
      return { from: "", to: "" };
  }
}

export function Costs() {
  const { t } = useTranslation("costs");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: t("pageTitle") }]);
  }, [setBreadcrumbs, t]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : "",
        to: customTo ? new Date(customTo + "T23:59:59.999Z").toISOString() : "",
      };
    }
    return computeRange(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject };
    },
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message={t("selectCompanyToViewCosts")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="costs" />;
  }

  const presetKeys: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];

  const barVariant = data && data.summary.budgetCents > 0
    ? data.summary.utilizationPercent > 90
      ? "_red"
      : data.summary.utilizationPercent > 70
        ? "_yellow"
        : "_green"
    : "_green";

  return (
    <div className="costs-page">
      <div className="costs-filters">
        {presetKeys.map((p) => (
          <Button
            key={p}
            variant={preset === p ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setPreset(p)}
          >
            {t(PRESET_KEYS[p])}
          </Button>
        ))}
        {preset === "custom" && (
          <div className="costs-custom-range">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span>{t("to")}</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {error && <p className="costs-error">{error.message}</p>}

      {data && (
        <>
          <Card>
            <CardContent className="costs-summary-card">
              <div className="costs-summary-header">
                <p className="costs-summary-label">{t(PRESET_KEYS[preset])}</p>
                {data.summary.budgetCents > 0 && (
                  <p className="costs-summary-label">
                    {t("utilized", { pct: data.summary.utilizationPercent })}
                  </p>
                )}
              </div>
              <p className="costs-summary-value">
                {formatCents(data.summary.spendCents)}{" "}
                <span className="costs-summary-budget">
                  {data.summary.budgetCents > 0
                    ? `/ ${formatCents(data.summary.budgetCents)}`
                    : t("unlimitedBudget")}
                </span>
              </p>
              {data.summary.budgetCents > 0 && (
                <div className="costs-summary-bar-wrap">
                  <div
                    className={`costs-summary-bar ${barVariant}`}
                    style={{ width: `${Math.min(100, data.summary.utilizationPercent)}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {(() => {
            const totalInput = data.byAgent.reduce(
              (acc, row) => acc + row.inputTokens + (row.subscriptionInputTokens ?? 0),
              0
            );
            const totalOutput = data.byAgent.reduce(
              (acc, row) => acc + row.outputTokens + (row.subscriptionOutputTokens ?? 0),
              0
            );
            const totalTokenSummary = t("totalTokensInRange", {
              range: t(PRESET_KEYS[preset]),
              input: formatTokens(totalInput),
              output: formatTokens(totalOutput),
            });
            return (
              <div className="costs-charts-grid">
                <TokenUsageByAgentChart data={data.byAgent} totalTokenSummary={totalTokenSummary} />
                <TokenUsageByProjectChart data={data.byProject} totalTokenSummary={totalTokenSummary} />
              </div>
            );
          })()}
          <div>
            <SubscriptionRunsByAgentChart data={data.byAgent} />
          </div>

          <div className="costs-panels-grid">
            <Card>
              <CardContent className="costs-panel">
                <h3 className="costs-panel-title">{t("byAgent")}</h3>
                {data.byAgent.length === 0 ? (
                  <p className="costs-panel-empty">{t("noCostEventsYet")}</p>
                ) : (
                  <div className="costs-by-agent-list">
                    {data.byAgent.map((row) => (
                      <div key={row.agentId} className="costs-by-agent-row">
                        <div className="costs-by-agent-left">
                          <Identity
                            name={row.agentName ?? row.agentId}
                            size="sm"
                          />
                          {row.agentStatus === "terminated" && (
                            <StatusBadge status="terminated" />
                          )}
                        </div>
                        <div className="costs-by-agent-right">
                          <span className="costs-by-agent-amount">{formatCents(row.costCents)}</span>
                          <span className="costs-by-agent-tokens">
                            {t("inOutTok", {
                              in: formatTokens(row.inputTokens),
                              out: formatTokens(row.outputTokens),
                            })}
                          </span>
                          {(row.apiRunCount > 0 || row.subscriptionRunCount > 0) && (
                            <span className="costs-by-agent-runs">
                              {row.apiRunCount > 0 ? t("apiRunsCount", { count: row.apiRunCount }) : null}
                              {row.apiRunCount > 0 && row.subscriptionRunCount > 0 ? " | " : null}
                              {row.subscriptionRunCount > 0
                                ? t("subscriptionRunsDetail", {
                                    count: row.subscriptionRunCount,
                                    in: formatTokens(row.subscriptionInputTokens),
                                    out: formatTokens(row.subscriptionOutputTokens),
                                  })
                                : null}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="costs-panel">
                <h3 className="costs-panel-title">{t("byProject")}</h3>
                {data.byProject.length === 0 ? (
                  <p className="costs-panel-empty">{t("noProjectCostsYet")}</p>
                ) : (
                  <div className="costs-by-agent-list">
                    {data.byProject.map((row) => (
                      <div key={row.projectId ?? "na"} className="costs-by-project-row">
                        <span>
                          {row.projectName ?? row.projectId ?? t("unattributed")}
                        </span>
                        <span className="costs-by-agent-amount">{formatCents(row.costCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
