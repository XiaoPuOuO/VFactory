import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import type { HeartbeatRun } from "@paperclipai/shared";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Activity, CheckCircle2, XCircle, Clock, AlertTriangle, Bot, CalendarDays, Filter, ChevronRight, Hash } from "lucide-react";
import "./RunQuality.css";

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return { from, to };
}

function StatusBadge({ status }: { status: string }) {
  const isSucceeded = status === "succeeded";
  const isFailed = ["failed", "error", "terminated"].includes(status);
  const isTimeout = status === "timed_out";
  const isBlocked = status === "blocked";

  let Icon = null;
  let theme = "default";
  
  if (isSucceeded) { Icon = CheckCircle2; theme = "success"; }
  else if (isFailed) { Icon = XCircle; theme = "danger"; }
  else if (isTimeout) { Icon = Clock; theme = "warning"; }
  else if (isBlocked) { Icon = AlertTriangle; theme = "warning"; }

  return (
    <span className={`rq-badge rq-badge-${theme}`}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      <span className="rq-badge-text">{status}</span>
    </span>
  );
}

export function RunQuality() {
  const { t } = useTranslation("runQuality");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [{ from, to }, setRange] = useState(defaultRange);
  const [agentId, setAgentId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [clusterKey, setClusterKey] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("pageTitle") }]);
  }, [setBreadcrumbs, t]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: queryKeys.runQuality.summary(selectedCompanyId!, fromIso, toIso),
    queryFn: () => heartbeatsApi.qualitySummary(selectedCompanyId!, from, to),
    enabled: !!selectedCompanyId,
  });

  const { data: clusters, isLoading: clLoading } = useQuery({
    queryKey: queryKeys.runQuality.clusters(selectedCompanyId!, fromIso, toIso),
    queryFn: () => heartbeatsApi.errorClusters(selectedCompanyId!, from, to),
    enabled: !!selectedCompanyId,
  });

  const listFilters = useMemo(
    () => ({
      agentId: agentId || undefined,
      limit: 150,
      startedAfter: from,
      endedBefore: to,
      status: statusFilter || undefined,
    }),
    [agentId, from, to, statusFilter],
  );

  const { data: listResp, isLoading: listLoading } = useQuery({
    queryKey: queryKeys.runQuality.list(selectedCompanyId!, listFilters),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, listFilters),
    enabled: !!selectedCompanyId,
  });

  const runs = listResp?.runs ?? [];
  const filteredRuns = useMemo(() => {
    if (!clusterKey) return runs;
    if (clusterKey.startsWith("code:")) {
      const code = clusterKey.slice("code:".length);
      return runs.filter((r) => (r.errorCode ?? "").trim() === code);
    }
    if (clusterKey.startsWith("norm:")) {
      return runs.filter((r) => r.status === "failed" || r.status === "timed_out");
    }
    return runs;
  }, [runs, clusterKey]);

  const agentName = (id: string) => agents?.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  if (!selectedCompanyId) {
    return <EmptyState icon={Activity} message={t("selectCompany")} />;
  }

  if (sumLoading && !summary) {
    return <PageSkeleton />;
  }

  return (
    <div className="rq-page">
      <header className="rq-header">
        <div className="rq-header-content">
          <h1 className="rq-title">{t("pageTitle")}</h1>
          <p className="rq-subtitle">{t("subtitle")}</p>
        </div>
      </header>

      <section className="rq-controls">
        <div className="rq-filter-group">
          <div className="rq-field">
            <label className="rq-field-label">
              <CalendarDays size={14} /> {t("from")}
            </label>
            <div className="rq-input-wrapper">
              <input
                type="datetime-local"
                className="rq-input rq-datetime"
                value={from.toISOString().slice(0, 16)}
                onChange={(e) => setRange((r) => ({ ...r, from: new Date(e.target.value) }))}
              />
            </div>
          </div>
          <div className="rq-field">
            <label className="rq-field-label">
              <CalendarDays size={14} /> {t("to")}
            </label>
            <div className="rq-input-wrapper">
              <input
                type="datetime-local"
                className="rq-input rq-datetime"
                value={to.toISOString().slice(0, 16)}
                onChange={(e) => setRange((r) => ({ ...r, to: new Date(e.target.value) }))}
              />
            </div>
          </div>
          <div className="rq-field">
            <label className="rq-field-label">
              <Bot size={14} /> {t("agent")}
            </label>
            <div className="rq-input-wrapper">
                <select className="rq-input rq-select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">{t("allAgents")}</option>
                {(agents ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                    {a.name}
                    </option>
                ))}
                </select>
            </div>
          </div>
          <div className="rq-field">
            <label className="rq-field-label">
              <Filter size={14} /> {t("status")}
            </label>
            <div className="rq-input-wrapper">
                <input
                type="text"
                className="rq-input"
                placeholder="succeeded,failed..."
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                />
            </div>
          </div>
        </div>
      </section>

      {summary && (
        <section className="rq-summary-grid">
          <div className="rq-card">
            <div className="rq-card-icon"><Activity size={16} /></div>
            <div className="rq-card-content">
              <div className="rq-card-label">{t("totalRuns")}</div>
              <div className="rq-card-value">{summary.company.totalRuns}</div>
            </div>
          </div>
          <div className="rq-card rq-card-success">
            <div className="rq-card-icon"><CheckCircle2 size={16} /></div>
            <div className="rq-card-content">
              <div className="rq-card-label">{t("succeeded")}</div>
              <div className="rq-card-value text-success">{summary.company.succeeded}</div>
            </div>
          </div>
          <div className="rq-card rq-card-danger">
            <div className="rq-card-icon"><XCircle size={16} /></div>
            <div className="rq-card-content">
              <div className="rq-card-label">{t("failed")}</div>
              <div className="rq-card-value text-danger">{summary.company.failed}</div>
            </div>
          </div>
          <div className="rq-card">
            <div className="rq-card-icon"><Clock size={16} /></div>
            <div className="rq-card-content">
              <div className="rq-card-label">{t("avgDuration")}</div>
              <div className="rq-card-value">
                {summary.company.avgDurationMs != null
                  ? `${Math.round(summary.company.avgDurationMs / 1000)}s`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="rq-card">
            <div className="rq-card-icon"><Hash size={16} /></div>
            <div className="rq-card-content">
              <div className="rq-card-label">{t("tokens")}</div>
              <div className="rq-card-value">{summary.company.totalTokens}</div>
            </div>
          </div>
        </section>
      )}

      <div className="rq-layout-grid">
        <section className="rq-section">
          <div className="rq-section-header">
            <h2 className="rq-section-title"><Bot size={18} /> {t("agentComparison")}</h2>
          </div>
          <div className="rq-table-container">
            <table className="rq-table">
              <thead>
                <tr>
                  <th>{t("agent")}</th>
                  <th>{t("totalRuns")}</th>
                  <th>{t("succeeded")}</th>
                  <th>{t("failed")}</th>
                  <th>{t("avgDuration")}</th>
                  <th>{t("tokens")}</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.agents ?? []).map((row) => (
                  <tr key={row.agentId} className="rq-tr-hoverable">
                    <td className="rq-cell-primary">
                      <div className="rq-agent-name">
                        <span className="rq-avatar-placeholder">{agentName(row.agentId).charAt(0).toUpperCase()}</span>
                        {agentName(row.agentId)}
                      </div>
                    </td>
                    <td>{row.totalRuns}</td>
                    <td>{row.succeeded > 0 ? <span className="text-success rq-font-medium">{row.succeeded}</span> : 0}</td>
                    <td>{row.failed > 0 ? <span className="text-danger rq-font-medium">{row.failed}</span> : 0}</td>
                    <td>
                      <span className="rq-badge rq-badge-default">
                        {row.avgDurationMs != null ? `${Math.round(row.avgDurationMs / 1000)}s` : "—"}
                      </span>
                    </td>
                    <td className="rq-text-muted">{row.totalTokens}</td>
                  </tr>
                ))}
                {(summary?.agents ?? []).length === 0 && (
                  <tr><td colSpan={6} className="rq-empty-row">{t("noResults")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rq-section">
          <div className="rq-section-header">
            <h2 className="rq-section-title"><AlertTriangle size={18} /> {t("errorClusters")}</h2>
            {clusterKey && (
              <button type="button" className="rq-btn-clear" onClick={() => setClusterKey(null)}>
                {t("clearCluster")}
              </button>
            )}
          </div>
          <div className="rq-table-container">
            {clLoading && !clusters ? (
              <div className="rq-loading-state">{t("loading")}</div>
            ) : (
              <table className="rq-table rq-interactive-table">
                <thead>
                  <tr>
                    <th>{t("cluster")}</th>
                    <th>{t("count")}</th>
                    <th>{t("agents")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(clusters ?? []).map((c) => {
                    const isActive = clusterKey === c.key;
                    return (
                      <tr 
                        key={c.key} 
                        className={`rq-tr-clickable ${isActive ? "rq-tr-active" : ""}`}
                        onClick={() => setClusterKey((k) => (k === c.key ? null : c.key))}
                      >
                        <td className="rq-cell-primary rq-truncate-cell">
                          <span className="rq-cluster-name" title={c.errorCode ?? c.normalizedMessage ?? c.key}>
                            {c.errorCode ?? c.normalizedMessage ?? c.key}
                          </span>
                        </td>
                        <td><span className="rq-badge rq-badge-danger">{c.count}</span></td>
                        <td><span className="rq-text-muted">{c.agentIds.length}</span></td>
                      </tr>
                    );
                  })}
                  {(clusters ?? []).length === 0 && (
                    <tr><td colSpan={3} className="rq-empty-row">{t("noResults")}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="rq-section rq-timeline-section">
        <div className="rq-section-header">
          <h2 className="rq-section-title"><Activity size={18} /> {t("timeline")}</h2>
        </div>
        <div className="rq-table-container rq-timeline-container">
          {listLoading && !listResp ? (
            <div className="rq-loading-state">{t("loading")}</div>
          ) : (
            <table className="rq-table rq-timeline-table">
              <thead>
                <tr>
                  <th>{t("time")}</th>
                  <th>{t("agent")}</th>
                  <th>{t("status")}</th>
                  <th>{t("source")}</th>
                  <th className="rq-cell-right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r: HeartbeatRun) => (
                  <tr key={r.id} className="rq-tr-hoverable">
                    <td className="rq-text-sm rq-text-muted">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="rq-cell-primary">
                      <div className="rq-agent-name rq-agent-name-sm">
                        <span className="rq-avatar-placeholder rq-avatar-sm">{agentName(r.agentId).charAt(0).toUpperCase()}</span>
                        {agentName(r.agentId)}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="rq-text-sm rq-text-muted">{r.invocationSource}</td>
                    <td className="rq-cell-right">
                      <Link className="rq-btn-icon" to={`/agents/${r.agentId}/runs/${r.id}`} aria-label={t("open")}>
                        <ChevronRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredRuns.length === 0 && (
                  <tr><td colSpan={5} className="rq-empty-row">{t("noResults")}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
