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
import { Activity } from "lucide-react";
import "./RunQuality.css";

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return { from, to };
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
    <div className="run-quality-page">
      <header className="run-quality-header">
        <h1 className="run-quality-title">{t("pageTitle")}</h1>
        <p className="run-quality-subtitle">{t("subtitle")}</p>
      </header>

      <section className="run-quality-filters">
        <label className="run-quality-field">
          <span>{t("from")}</span>
          <input
            type="datetime-local"
            value={from.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, from: new Date(e.target.value) }))}
          />
        </label>
        <label className="run-quality-field">
          <span>{t("to")}</span>
          <input
            type="datetime-local"
            value={to.toISOString().slice(0, 16)}
            onChange={(e) => setRange((r) => ({ ...r, to: new Date(e.target.value) }))}
          />
        </label>
        <label className="run-quality-field">
          <span>{t("agent")}</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">{t("allAgents")}</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="run-quality-field">
          <span>{t("status")}</span>
          <input
            type="text"
            placeholder="succeeded,failed,..."
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </label>
      </section>

      {summary && (
        <section className="run-quality-summary-cards">
          <div className="run-quality-card">
            <div className="run-quality-card-label">{t("totalRuns")}</div>
            <div className="run-quality-card-value">{summary.company.totalRuns}</div>
          </div>
          <div className="run-quality-card">
            <div className="run-quality-card-label">{t("succeeded")}</div>
            <div className="run-quality-card-value">{summary.company.succeeded}</div>
          </div>
          <div className="run-quality-card">
            <div className="run-quality-card-label">{t("failed")}</div>
            <div className="run-quality-card-value">{summary.company.failed}</div>
          </div>
          <div className="run-quality-card">
            <div className="run-quality-card-label">{t("avgDuration")}</div>
            <div className="run-quality-card-value">
              {summary.company.avgDurationMs != null
                ? `${Math.round(summary.company.avgDurationMs / 1000)}s`
                : "—"}
            </div>
          </div>
          <div className="run-quality-card">
            <div className="run-quality-card-label">{t("tokens")}</div>
            <div className="run-quality-card-value">{summary.company.totalTokens}</div>
          </div>
        </section>
      )}

      <section className="run-quality-section">
        <h2 className="run-quality-section-title">{t("agentComparison")}</h2>
        <div className="run-quality-table-wrap">
          <table className="run-quality-table">
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
                <tr key={row.agentId}>
                  <td>{agentName(row.agentId)}</td>
                  <td>{row.totalRuns}</td>
                  <td>{row.succeeded}</td>
                  <td>{row.failed}</td>
                  <td>
                    {row.avgDurationMs != null ? `${Math.round(row.avgDurationMs / 1000)}s` : "—"}
                  </td>
                  <td>{row.totalTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="run-quality-section">
        <h2 className="run-quality-section-title">{t("errorClusters")}</h2>
        {clLoading && !clusters ? (
          <p className="run-quality-muted">{t("loading")}</p>
        ) : (
          <div className="run-quality-table-wrap">
            <table className="run-quality-table">
              <thead>
                <tr>
                  <th>{t("cluster")}</th>
                  <th>{t("count")}</th>
                  <th>{t("agents")}</th>
                </tr>
              </thead>
              <tbody>
                {(clusters ?? []).map((c) => (
                  <tr key={c.key}>
                    <td>
                      <button
                        type="button"
                        className="run-quality-cluster-btn"
                        onClick={() => setClusterKey((k) => (k === c.key ? null : c.key))}
                      >
                        {c.errorCode ?? c.normalizedMessage ?? c.key}
                      </button>
                    </td>
                    <td>{c.count}</td>
                    <td>{c.agentIds.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {clusterKey && (
          <p className="run-quality-hint">
            {t("clusterFilterHint")}{" "}
            <button type="button" className="run-quality-linkish" onClick={() => setClusterKey(null)}>
              {t("clearCluster")}
            </button>
          </p>
        )}
      </section>

      <section className="run-quality-section">
        <h2 className="run-quality-section-title">{t("timeline")}</h2>
        {listLoading && !listResp ? (
          <p className="run-quality-muted">{t("loading")}</p>
        ) : (
          <div className="run-quality-table-wrap">
            <table className="run-quality-table">
              <thead>
                <tr>
                  <th>{t("time")}</th>
                  <th>{t("agent")}</th>
                  <th>{t("status")}</th>
                  <th>{t("source")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((r: HeartbeatRun) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{agentName(r.agentId)}</td>
                    <td>{r.status}</td>
                    <td>{r.invocationSource}</td>
                    <td>
                      <Link className="run-quality-link" to={`/agents/${r.agentId}/runs/${r.id}`}>
                        {t("open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
