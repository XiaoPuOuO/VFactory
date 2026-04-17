import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { costsApi, type CostByProject } from "../api/costs";
import type {
  CostByAgent,
  CostByBillingCode,
  CostByRequestDepth,
  CostSummary,
  LimitBreachEvent,
} from "@paperclipai/shared";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, Cpu } from "lucide-react";
import {
  SpendByBillingCodeChart,
  SpendByRequestDepthChart,
  TokenUsageByAgentChart,
  TokenUsageByProjectChart,
} from "../components/CostCharts";
import { BudgetPoliciesSection } from "../components/BudgetPoliciesSection";
import "./Costs.css";

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";
type BreakdownView = "agent" | "project";
type TokenUsageView = "agent" | "project";

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

const BREACH_TYPE_KEYS: Record<string, string> = {
  budget_breach: "breachBudget",
  token_limit_breach: "breachTokenLimit",
  price_limit_breach: "breachPriceLimit",
  budget_policy_breach: "breachPolicy",
};

function breachAgentLabel(ev: LimitBreachEvent): string | null {
  const d = ev.details;
  if (d && typeof d.agentName === "string" && d.agentName.trim() !== "") {
    return d.agentName;
  }
  return null;
}

export function Costs() {
  const { t } = useTranslation("costs");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [breakdownView, setBreakdownView] = useState<BreakdownView>("agent");
  const [tokenUsageView, setTokenUsageView] = useState<TokenUsageView>("agent");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tokenLimitInput, setTokenLimitInput] = useState<string>("");
  const [priceLimitInput, setPriceLimitInput] = useState<string>("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    queryFn: async (): Promise<{
      summary: CostSummary;
      byAgent: CostByAgent[];
      byProject: CostByProject[];
      byBillingCode: CostByBillingCode[];
      byRequestDepth: CostByRequestDepth[];
    }> => {
      const [summary, byAgent, byProject, byBillingCode, byRequestDepth] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byBillingCode(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byRequestDepth(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject, byBillingCode, byRequestDepth };
    },
    enabled: !!selectedCompanyId,
  });

  const updateLimitsMutation = useMutation({
    mutationFn: (body: { tokenLimit?: number | null; priceLimitCents?: number | null }) =>
      costsApi.updateLimits(selectedCompanyId!, body),
    onSuccess: async () => {
      setLimitsUpdateError(null);
      // 先等 costs 查詢 refetch 完成再解除同步，否則 useEffect 會用快取內舊 summary 覆寫輸入並把 limitsSynced 設回 true，
      // refetch 完成後便不再同步，造成「儲存成功但數字跳回舊值」。
      await queryClient.refetchQueries({ queryKey: queryKeys.costsAllRanges(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(selectedCompanyId!) });
      setLimitsSynced(false);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : err != null ? String(err) : "Unknown error";
      setLimitsUpdateError(message);
    },
  });

  const [limitsSynced, setLimitsSynced] = useState(false);
  const [limitsUpdateError, setLimitsUpdateError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedCompanyId) setLimitsSynced(false);
  }, [selectedCompanyId]);
  useEffect(() => {
    if (data?.summary && !limitsSynced) {
      const s = data.summary;
      /** 僅同步「公司覆寫」；勿用 tokenLimit／priceLimitCents（合併後有效值，清除覆寫會變回方案數字）。 */
      setTokenLimitInput(
        s.tokenLimitOverride != null ? String(s.tokenLimitOverride) : "",
      );
      setPriceLimitInput(
        s.priceLimitCentsOverride != null ? String(s.priceLimitCentsOverride) : "",
      );
      setLimitsSynced(true);
    }
  }, [data?.summary, limitsSynced, selectedCompanyId]);

  const presetKeys: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];

  const barVariant = data && data.summary.budgetCents > 0
    ? data.summary.utilizationPercent > 85
      ? "_red"
      : data.summary.utilizationPercent >= 60
        ? "_yellow"
        : "_green"
    : "_green";

  const errorMessage =
    error != null
      ? error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : String(error)
      : null;

  /** 總 token 數量（供 KPI 卡片使用） */
  const totalTokens = useMemo(() => {
    if (!data) return 0;
    return data.byAgent.reduce(
      (acc, row) =>
        acc + row.inputTokens + row.outputTokens + row.cachedReadTokens + row.cachedWriteTokens,
      0
    );
  }, [data]);

  const totalTokenSummary = useMemo(() => {
    if (!data) return "";
    const totalInput = data.byAgent.reduce((acc, row) => acc + row.inputTokens, 0);
    const totalOutput = data.byAgent.reduce((acc, row) => acc + row.outputTokens, 0);
    const totalCR = data.byAgent.reduce((acc, row) => acc + row.cachedReadTokens, 0);
    const totalCW = data.byAgent.reduce((acc, row) => acc + row.cachedWriteTokens, 0);
    return t("totalTokensInRange", {
      range: t(PRESET_KEYS[preset]),
      input: formatTokens(totalInput),
      output: formatTokens(totalOutput),
      cr: formatTokens(totalCR),
      cw: formatTokens(totalCW),
    });
  }, [data, preset, t]);

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message={t("selectCompanyToViewCosts")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="costs" />;
  }

  return (
    <div className="costs-page">
      {/* ── 工具列 ── */}
      <div className="costs-toolbar">
        <Tabs
          value={preset}
          onValueChange={(v) => setPreset(v as DatePreset)}
          className="costs-filters"
        >
          <TabsList variant="default" align="start" aria-label={t("dateRangeTabsLabel")} className="costs-preset-tabs">
            {presetKeys.map((p) => (
              <TabsTrigger key={p} value={p}>
                {t(PRESET_KEYS[p])}
              </TabsTrigger>
            ))}
          </TabsList>
          {preset === "custom" && (
            <fieldset className="costs-custom-range" aria-label={t("customRangeLegend")}>
              <legend className="sr-only">{t("customRangeLegend")}</legend>
              <label className="costs-custom-range-field">
                <span className="sr-only">{t("from")}</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label={t("from")}
                />
              </label>
              <span aria-hidden="true">{t("to")}</span>
              <label className="costs-custom-range-field">
                <span className="sr-only">{t("to")}</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label={t("to")}
                />
              </label>
            </fieldset>
          )}
        </Tabs>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="costs-export-csv"
          disabled={!selectedCompanyId || exportingCsv}
          onClick={async () => {
            if (!selectedCompanyId) return;
            setExportError(null);
            setExportingCsv(true);
            try {
              await costsApi.downloadCostEventsCsv(
                selectedCompanyId,
                from || undefined,
                to || undefined,
                preset === "all" ? { scopeAll: true } : undefined,
              );
            } catch (err) {
              const message =
                err instanceof Error ? err.message : err != null ? String(err) : "Export failed";
              setExportError(message);
            } finally {
              setExportingCsv(false);
            }
          }}
        >
          {exportingCsv ? t("exportCsvLoading") : t("exportCsv")}
        </Button>
      </div>

      {/* ── 錯誤訊息 ── */}
      {errorMessage && (
        <div className="costs-error" role="alert" aria-live="assertive">
          {errorMessage}
        </div>
      )}
      {exportError && (
        <div className="costs-error" role="alert" aria-live="assertive">
          {exportError}
        </div>
      )}

      {data && (
        <>
          {/* ── KPI 摘要卡片（Apple Finance widget 風格） ── */}
          <div className="costs-kpi-grid" aria-label={t("kpiSummary", { defaultValue: "費用摘要" })}>
            {/* 本期支出 */}
            <div className="costs-kpi-card">
              <div className="costs-kpi-icon costs-kpi-icon--blue">
                <DollarSign size={18} />
              </div>
              <p className="costs-kpi-label">{t(PRESET_KEYS[preset])}</p>
              <p className="costs-kpi-value">{formatCents(data.summary.spendCents)}</p>
              <p className="costs-kpi-sub">
                {data.summary.budgetCents > 0
                  ? t("utilized", { pct: data.summary.utilizationPercent })
                  : t("unlimitedBudget")}
              </p>
            </div>

            {/* 月底預測支出 */}
            <div className="costs-kpi-card">
              <div className="costs-kpi-icon costs-kpi-icon--orange">
                <TrendingUp size={18} />
              </div>
              <p className="costs-kpi-label">
                {t("forecastTitle", { defaultValue: "月底預測" })}
              </p>
              <p className="costs-kpi-value">
                {data.summary.forecast
                  ? formatCents(data.summary.forecast.monthProjectedSpendCents)
                  : "—"}
              </p>
              <p className={`costs-kpi-sub${
                data.summary.forecast?.likelyMonthBudgetBreach ? " costs-kpi-sub--alert" : ""
              }`}>
                {data.summary.forecast?.likelyMonthBudgetBreach
                  ? t("forecastLikelyBreach")
                  : data.summary.forecast
                    ? t("forecastWeekCompare", {
                        last: formatCents(data.summary.forecast.last7DaysSpendCents),
                        prev: formatCents(data.summary.forecast.previous7DaysSpendCents),
                      })
                    : "—"}
              </p>
            </div>

            {/* Token 總量 */}
            <div className="costs-kpi-card">
              <div className="costs-kpi-icon costs-kpi-icon--purple">
                <Cpu size={18} />
              </div>
              <p className="costs-kpi-label">
                {t("totalTokensLabel", { defaultValue: "Token 總量" })}
              </p>
              <p className="costs-kpi-value">{formatTokens(totalTokens)}</p>
              <p className="costs-kpi-sub">
                {t("agents", { count: data.byAgent.length, defaultValue: `${data.byAgent.length} 個 AI 員工` })}
              </p>
            </div>
          </div>

          {/* ── 主要洞察：Token 圖表 + 金額明細 ── */}
          <div className="costs-insights-grid">
            {/* 左：Token 使用量橫條圖 */}
            <div className="costs-insights-left">
              <Card className="costs-glass-panel">
                <CardContent className="costs-panel costs-left-panel">
                  <Tabs
                    value={tokenUsageView}
                    onValueChange={(v) => setTokenUsageView(v as TokenUsageView)}
                  >
                    <div className="costs-insights-left-header">
                      <TabsList
                        variant="default"
                        align="start"
                        aria-label={t("tokenUsageTabsLabel")}
                        className="costs-toggle-tabs"
                      >
                        <TabsTrigger value="agent">{t("byAgent")}</TabsTrigger>
                        <TabsTrigger value="project">{t("byProject")}</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="agent" className="costs-tabs-content">
                      <TokenUsageByAgentChart data={data.byAgent} totalTokenSummary={totalTokenSummary} />
                    </TabsContent>
                    <TabsContent value="project" className="costs-tabs-content">
                      <TokenUsageByProjectChart data={data.byProject} totalTokenSummary={totalTokenSummary} />
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            {/* 右：金額明細 + 列表 */}
            <div className="costs-insights-right">
              <Card className="costs-glass-panel">
                <CardContent className="costs-panel">
                  <Tabs
                    value={breakdownView}
                    onValueChange={(v) => setBreakdownView(v as BreakdownView)}
                  >
                    {/* Header：金額 Hero */}
                    <div className="costs-breakdown-header">
                      <div className="costs-breakdown-title-wrap">
                        <div className="costs-breakdown-title-top">
                          <h3 className="costs-panel-title">{t("breakdown")}</h3>
                          <span className="costs-breakdown-range">{t(PRESET_KEYS[preset])}</span>
                        </div>
                        <div className="costs-breakdown-title-bottom">
                          <span className="costs-breakdown-amount">
                            {formatCents(data.summary.spendCents)}
                          </span>
                          <span className="costs-breakdown-budget">
                            {data.summary.budgetCents > 0
                              ? `/ ${formatCents(data.summary.budgetCents)}`
                              : t("unlimitedBudget")}
                          </span>
                          {data.summary.budgetCents > 0 && (
                            <span className="costs-breakdown-utilized">
                              {t("utilized", { pct: data.summary.utilizationPercent })}
                            </span>
                          )}
                        </div>

                        {/* 進度條 */}
                        {data.summary.budgetCents > 0 && (
                          <div className="costs-breakdown-bar-wrap">
                            <div
                              className={`costs-breakdown-bar ${barVariant}`}
                              style={{ width: `${Math.min(100, data.summary.utilizationPercent)}%` }}
                              role="progressbar"
                              aria-label={t("budgetUtilizationProgressbar")}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.min(100, Math.max(0, data.summary.utilizationPercent))}
                            />
                          </div>
                        )}

                        {/* 預測資訊（精簡版，大數字已在 KPI 卡片呈現） */}
                        {data.summary.forecast && (
                          <div className="costs-forecast">
                            {data.summary.forecast.likelyMonthBudgetBreach && (
                              <p className="costs-forecast-alert">{t("forecastLikelyBreach")}</p>
                            )}
                            {data.summary.forecast.spendSpikeVsPreviousWeek && (
                              <p className="costs-forecast-alert">{t("forecastSpendSpike")}</p>
                            )}
                            <p className="costs-forecast-week">
                              {t("forecastWeekCompare", {
                                last: formatCents(data.summary.forecast.last7DaysSpendCents),
                                prev: formatCents(data.summary.forecast.previous7DaysSpendCents),
                              })}
                            </p>
                          </div>
                        )}
                      </div>

                      <TabsList
                        variant="default"
                        align="start"
                        aria-label={t("breakdownTabsLabel")}
                        className="costs-breakdown-toggle"
                      >
                        <TabsTrigger value="agent">{t("byAgent")}</TabsTrigger>
                        <TabsTrigger value="project">{t("byProject")}</TabsTrigger>
                      </TabsList>
                    </div>

                    {/* 明細列表 */}
                    <TabsContent value="agent" className="costs-breakdown-body costs-tabs-content">
                      {data.byAgent.length === 0 ? (
                        <p className="costs-panel-empty">{t("noCostEventsYet")}</p>
                      ) : (
                        <div className="costs-breakdown-list">
                          {data.byAgent.map((row) => (
                            <div key={row.agentId} className="costs-breakdown-item">
                              <div className="costs-breakdown-item-top">
                                <div className="costs-breakdown-item-left">
                                  <Identity name={row.agentName ?? row.agentId} size="sm" />
                                  {row.agentStatus === "terminated" && (
                                    <StatusBadge status="terminated" />
                                  )}
                                </div>
                                <div className="costs-breakdown-item-right">
                                  <span className="costs-breakdown-item-amount">
                                    {formatCents(row.costCents)}
                                  </span>
                                </div>
                              </div>
                              <div className="costs-breakdown-item-sub">
                                <span className="costs-breakdown-item-tokens">
                                  {t("inOutTok", {
                                    in: formatTokens(row.inputTokens),
                                    out: formatTokens(row.outputTokens),
                                    cr: formatTokens(row.cachedReadTokens),
                                    cw: formatTokens(row.cachedWriteTokens),
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="project" className="costs-breakdown-body costs-tabs-content">
                      {data.byProject.length === 0 ? (
                        <p className="costs-panel-empty">{t("noProjectCostsYet")}</p>
                      ) : (
                        <div className="costs-breakdown-list">
                          {data.byProject.map((row) => (
                            <div key={row.projectId ?? "na"} className="costs-breakdown-item">
                              <div className="costs-breakdown-item-top">
                                <div className="costs-breakdown-item-left">
                                  <span className="costs-breakdown-item-name">
                                    {row.projectName ?? row.projectId ?? t("unattributed")}
                                  </span>
                                </div>
                                <div className="costs-breakdown-item-right">
                                  <span className="costs-breakdown-item-amount">
                                    {formatCents(row.costCents)}
                                  </span>
                                </div>
                              </div>
                              <div className="costs-breakdown-item-sub">
                                <span className="costs-breakdown-item-tokens">
                                  {t("inOutTok", {
                                    in: formatTokens(row.inputTokens),
                                    out: formatTokens(row.outputTokens),
                                    cr: formatTokens(row.cachedReadTokens),
                                    cw: formatTokens(row.cachedWriteTokens),
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── 進階歸因（Billing Code / Request Depth） ── */}
          <section className="costs-advanced-section" aria-labelledby="costs-advanced-heading">
            <h2 id="costs-advanced-heading" className="costs-advanced-heading">
              {t("advancedAttribution")}
            </h2>
            <p className="costs-attribution-hint">{t("attributionHint")}</p>
            <div className="costs-panels-grid">
              <Card className="costs-glass-panel">
                <CardContent className="costs-panel costs-advanced-chart-wrap">
                  <SpendByBillingCodeChart data={data.byBillingCode} />
                </CardContent>
              </Card>
              <Card className="costs-glass-panel">
                <CardContent className="costs-panel costs-advanced-chart-wrap">
                  <SpendByRequestDepthChart data={data.byRequestDepth} />
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── 違規紀錄 ── */}
          {data.summary.breachEvents != null && (
            <Card className="costs-glass-panel">
              <CardContent className="costs-panel">
                <h3 className="costs-panel-title">{t("breachHistory")}</h3>
                {(data.summary.breachEvents?.length ?? 0) === 0 ? (
                  <p className="costs-panel-empty">{t("noBreachesYet")}</p>
                ) : (
                  <div className="costs-breach-table-wrap">
                    <table className="costs-breach-table">
                      <caption className="sr-only">{t("breachHistory")}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t("breachType")}</th>
                          <th scope="col">{t("breachAgent")}</th>
                          <th scope="col">{t("breachOccurredAt")}</th>
                          <th scope="col">{t("breachAmount")}</th>
                          <th scope="col">{t("breachTokenUsage")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.summary.breachEvents ?? []).map((ev) => {
                          const agentName = breachAgentLabel(ev);
                          return (
                            <tr key={ev.id}>
                              <td>{t(BREACH_TYPE_KEYS[ev.type] ?? ev.type)}</td>
                              <td>
                                {ev.agentId ? (
                                  <Link className="costs-breach-agent-link" to={`/agents/${ev.agentId}`}>
                                    {agentName ?? ev.agentId.slice(0, 8)}
                                  </Link>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{new Date(ev.occurredAt).toLocaleString()}</td>
                              <td>{ev.amountCents != null ? formatCents(ev.amountCents) : "—"}</td>
                              <td>{ev.tokenUsage != null ? formatTokens(ev.tokenUsage) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── 預算政策 ── */}
          <Card className="costs-glass-panel">
            <CardContent className="costs-panel">
              <BudgetPoliciesSection companyId={selectedCompanyId} />
            </CardContent>
          </Card>

          {/* ── 公司限額設定 ── */}
          <Card className="costs-glass-panel">
            <CardContent className="costs-panel">
              <h3 className="costs-panel-title">{t("companyLimits")}</h3>
              <p className="costs-limits-desc">{t("tokenLimitDescription")}</p>
              <div className="costs-limits-form">
                <label className="costs-limits-label">
                  {t("tokenLimitLabel")}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="costs-limits-input"
                    value={tokenLimitInput}
                    onChange={(e) => setTokenLimitInput(e.target.value)}
                    placeholder={t("optional", { ns: "common" })}
                  />
                </label>
                <label className="costs-limits-label">
                  {t("priceLimitLabel")}
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="costs-limits-input"
                    value={priceLimitInput}
                    onChange={(e) => setPriceLimitInput(e.target.value)}
                    placeholder={t("optional", { ns: "common" })}
                  />
                </label>
                <p className="costs-limits-desc costs-limits-desc--small">{t("priceLimitDescription")}</p>
                <Button
                  size="sm"
                  disabled={updateLimitsMutation.isPending}
                  onClick={() => {
                    const rawToken =
                      tokenLimitInput.trim() === ""
                        ? null
                        : Math.max(0, parseInt(tokenLimitInput, 10) || 0);
                    const rawPrice =
                      priceLimitInput.trim() === ""
                        ? null
                        : Math.max(0, parseInt(priceLimitInput, 10) || 0);
                    /** 0 與留空同義：不設公司覆寫（後端亦同）；勿把 0 當成「無上限」。 */
                    updateLimitsMutation.mutate({
                      tokenLimit: rawToken === null || rawToken === 0 ? null : rawToken,
                      priceLimitCents: rawPrice === null || rawPrice === 0 ? null : rawPrice,
                    });
                  }}
                >
                  {updateLimitsMutation.isPending ? t("saving", { ns: "common" }) : t("updateLimits")}
                </Button>
                {limitsUpdateError && (
                  <span className="costs-limits-error" role="alert" aria-live="assertive">
                    {limitsUpdateError}
                  </span>
                )}
                {updateLimitsMutation.isSuccess && (
                  <span className="costs-limits-saved" aria-live="polite">
                    {t("limitsUpdated")}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
