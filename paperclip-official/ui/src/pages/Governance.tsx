import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, ApprovalWithLinkedIssueCount } from "@paperclipai/shared";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { companiesApi } from "../api/companies";
import { dashboardApi } from "../api/dashboard";
import { governanceApi } from "../api/governance";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ApprovalCard } from "../components/ApprovalCard";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "../components/PageSkeleton";
import "./Governance.css";

function scopeLabelKey(type: string): string {
  if (type === "hire_agent") return "scopeHireAgent";
  if (type === "approve_ceo_strategy") return "scopeCeoStrategy";
  return "scopeGeneric";
}

function GovernanceApprovalBlock({
  approval,
  requesterAgent,
  scopeText,
  onApprove,
  onReject,
  isMutationPending,
}: {
  approval: ApprovalWithLinkedIssueCount;
  requesterAgent: Agent | null;
  scopeText: string;
  onApprove: () => void;
  onReject: () => void;
  isMutationPending: boolean;
}) {
  const { t } = useTranslation("governance");
  return (
    <div className="governance-approval-block">
      <div className="governance-approval-meta">
        <span className="governance-approval-scope">{scopeText}</span>
        {approval.linkedIssueCount > 0 && (
          <span className="governance-approval-issues">
            {t("linkedIssuesCount", { count: approval.linkedIssueCount })}
          </span>
        )}
      </div>
      <ApprovalCard
        approval={approval}
        requesterAgent={requesterAgent}
        onApprove={onApprove}
        onReject={onReject}
        detailLink={`/approvals/${approval.id}`}
        isPending={isMutationPending}
      />
    </div>
  );
}

export function Governance() {
  const { t } = useTranslation("governance");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("pageTitle") }]);
  }, [setBreadcrumbs, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.governance.hub(selectedCompanyId!),
    queryFn: () => governanceApi.hub(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: dashboard } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: hirePolicy } = useQuery({
    queryKey: queryKeys.governance.hirePolicy(selectedCompanyId!),
    queryFn: () => companiesApi.getHireApprovalPolicy(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [policyMaxCents, setPolicyMaxCents] = useState("");

  useEffect(() => {
    if (!hirePolicy) return;
    setPolicyEnabled(hirePolicy.enabled);
    setPolicyMaxCents(
      hirePolicy.maxBudgetMonthlyCents != null ? String(hirePolicy.maxBudgetMonthlyCents) : "",
    );
  }, [hirePolicy]);

  const saveHirePolicyMutation = useMutation({
    mutationFn: () => {
      const raw = policyMaxCents.trim();
      const maxBudgetMonthlyCents =
        raw === "" ? null : Number.parseInt(raw, 10);
      if (maxBudgetMonthlyCents != null && (!Number.isFinite(maxBudgetMonthlyCents) || maxBudgetMonthlyCents < 0)) {
        return Promise.reject(new Error(t("policyInvalidBudget")));
      }
      return companiesApi.updateHireApprovalPolicy(selectedCompanyId!, {
        enabled: policyEnabled,
        maxBudgetMonthlyCents,
      });
    },
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.hirePolicy(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to save policy");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.hub(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.governance.hub(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  if (!selectedCompanyId) {
    return <p className="governance-select-company">{t("selectCompany")}</p>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" />;
  }

  const requester = (agentId: string | null) =>
    agentId ? (agents ?? []).find((a) => a.id === agentId) ?? null : null;

  const showBudgetHint =
    dashboard &&
    (dashboard.governance.agentsPausedByBudgetCount > 0 ||
      dashboard.governance.recentBreaches.length > 0);

  return (
    <div className="governance-page">
      <header className="governance-page-header">
        <h1 className="governance-page-title">{t("pageTitle")}</h1>
        <p className="governance-page-subtitle">{t("pageSubtitle")}</p>
      </header>

      {error && <p className="governance-error">{(error as Error).message}</p>}
      {actionError && <p className="governance-error">{actionError}</p>}

      <div className="governance-dashboard-top-row">
        <section className="governance-section" aria-labelledby="governance-policy-heading">
          <header className="governance-section-header">
            <h2 id="governance-policy-heading" className="governance-section-title">
              {t("policySection")}
            </h2>
          </header>
          <div className="governance-glass-card governance-policy-card">
            <p className="governance-policy-desc">{t("policySectionDesc")}</p>
            
            <div className="governance-policy-controls">
              <label className="governance-toggle-wrapper">
                <input
                  type="checkbox"
                  className="governance-toggle-input"
                  checked={policyEnabled}
                  onChange={(e) => setPolicyEnabled(e.target.checked)}
                />
                <div className="governance-toggle-slider"></div>
                <span className="governance-toggle-label">{t("policyEnableAuto")}</span>
              </label>

              <label className="governance-policy-field">
                <span className="governance-policy-label">{t("policyMaxBudgetCents")}</span>
                <div className="governance-input-wrapper">
                  <span className="governance-input-prefix">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="governance-policy-input"
                    value={policyMaxCents}
                    onChange={(e) => setPolicyMaxCents(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                  />
                  <span className="governance-input-suffix">USD</span>
                </div>
              </label>
            </div>

            <div className="governance-card-actions">
              <Button
                type="button"
                className="governance-hig-button"
                disabled={saveHirePolicyMutation.isPending}
                onClick={() => saveHirePolicyMutation.mutate()}
              >
                {t("policySave")}
              </Button>
            </div>
          </div>
        </section>

        {dashboard && (
          <section className="governance-section" aria-labelledby="governance-budget-heading">
            <header className="governance-section-header">
              <h2 id="governance-budget-heading" className="governance-section-title">
                {t("budgetSection")}
              </h2>
            </header>
            <div className="governance-glass-card governance-budget-card">
              <div className="governance-budget-card-title">{t("budgetSectionTitle")}</div>
              
              <div className="governance-budget-status">
                <div className="governance-budget-indicator"></div>
                <p className="governance-budget-card-desc">
                  {showBudgetHint
                    ? [
                        dashboard.governance.agentsPausedByBudgetCount > 0
                          ? t("budgetPausedCount", {
                              count: dashboard.governance.agentsPausedByBudgetCount,
                            })
                          : null,
                        dashboard.governance.recentBreaches.length > 0
                          ? t("budgetBreachesCount", {
                              count: dashboard.governance.recentBreaches.length,
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : t("budgetSectionHealthy")}
                </p>
              </div>

              <div className="governance-budget-links">
                <Link to="/dashboard" className="governance-hig-link">{t("linkDashboard")}</Link>
                <Link to="/costs" className="governance-hig-link">{t("linkCosts")}</Link>
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="governance-section" aria-labelledby="governance-pending-heading">
        <header className="governance-section-header">
          <h2 id="governance-pending-heading" className="governance-section-title">
            {t("pendingSection")}
          </h2>
          <span className="governance-badge">{data?.pendingApprovals.length || 0}</span>
        </header>
        {!data || data.pendingApprovals.length === 0 ? (
          <div className="governance-glass-card governance-empty-card">
            <p className="governance-empty">{t("noPending")}</p>
          </div>
        ) : (
          <div className="governance-grid">
            {data.pendingApprovals.map((approval) => (
              <GovernanceApprovalBlock
                key={approval.id}
                approval={approval}
                requesterAgent={requester(approval.requestedByAgentId)}
                scopeText={t(scopeLabelKey(approval.type))}
                onApprove={() => approveMutation.mutate(approval.id)}
                onReject={() => rejectMutation.mutate(approval.id)}
                isMutationPending={approveMutation.isPending || rejectMutation.isPending}
              />
            ))}
          </div>
        )}
      </section>

      <section className="governance-section" aria-labelledby="governance-enacted-heading">
        <header className="governance-section-header">
          <h2 id="governance-enacted-heading" className="governance-section-title">
            {t("enactedSection")}
          </h2>
          <span className="governance-badge">{data?.recentEnacted.length || 0}</span>
        </header>
        {!data || data.recentEnacted.length === 0 ? (
           <div className="governance-glass-card governance-empty-card">
            <p className="governance-empty">{t("noEnacted")}</p>
           </div>
        ) : (
          <div className="governance-grid">
            {data.recentEnacted.map((approval) => (
              <GovernanceApprovalBlock
                key={approval.id}
                approval={approval}
                requesterAgent={requester(approval.requestedByAgentId)}
                scopeText={t(scopeLabelKey(approval.type))}
                onApprove={() => {}}
                onReject={() => {}}
                isMutationPending={false}
              />
            ))}
          </div>
        )}
      </section>

      <div className="governance-footer-actions">
        <Link to="/approvals/pending" className="governance-hig-link">{t("viewAllApprovals")} &rarr;</Link>
      </div>
    </div>
  );
}
