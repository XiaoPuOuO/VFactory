import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BudgetPolicy } from "@paperclipai/shared";
import { costsApi } from "../api/costs";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { formatCents } from "../lib/utils";
import { Button } from "@/components/ui/button";

type ScopeForm = "project" | "billing_code" | "company";

export function BudgetPoliciesSection({ companyId }: { companyId: string }) {
  const { t } = useTranslation("costs");
  const queryClient = useQueryClient();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: queryKeys.budgetPolicies(companyId),
    queryFn: () => costsApi.listBudgetPolicies(companyId),
  });

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(companyId),
    queryFn: () => projectsApi.list(companyId),
  });

  const [scopeType, setScopeType] = useState<ScopeForm>("project");
  const [projectId, setProjectId] = useState("");
  const [billingCode, setBillingCode] = useState("");
  const [limitCents, setLimitCents] = useState("");
  const [onExceed, setOnExceed] = useState<BudgetPolicy["onExceed"]>("record_only");
  const [formError, setFormError] = useState<string | null>(null);

  const hasCompanyPolicy = useMemo(
    () => policies.some((p) => p.scopeType === "company"),
    [policies],
  );

  const createMutation = useMutation({
    mutationFn: () => {
      const cents = Math.max(0, parseInt(limitCents, 10) || 0);
      if (cents <= 0) {
        return Promise.reject(new Error(t("budgetPolicyLimitRequired")));
      }
      if (scopeType === "project" && !projectId) {
        return Promise.reject(new Error(t("budgetPolicyProjectRequired")));
      }
      if (scopeType === "billing_code" && !billingCode.trim()) {
        return Promise.reject(new Error(t("budgetPolicyBillingRequired")));
      }
      if (scopeType === "company" && hasCompanyPolicy) {
        return Promise.reject(new Error(t("budgetPolicyCompanyDuplicate")));
      }
      return costsApi.createBudgetPolicy(companyId, {
        scopeType,
        projectId: scopeType === "project" ? projectId : null,
        billingCode: scopeType === "billing_code" ? billingCode.trim() : null,
        limitCents: cents,
        onExceed,
        enabled: true,
      });
    },
    onSuccess: () => {
      setFormError(null);
      setLimitCents("");
      setBillingCode("");
      queryClient.invalidateQueries({ queryKey: queryKeys.budgetPolicies(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.costs(companyId) });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    },
  });

  const patchMutation = useMutation({
    mutationFn: (args: { id: string; body: { enabled?: boolean; onExceed?: BudgetPolicy["onExceed"] } }) =>
      costsApi.updateBudgetPolicy(companyId, args.id, args.body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgetPolicies(companyId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => costsApi.deleteBudgetPolicy(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgetPolicies(companyId) });
    },
  });

  return (
    <section className="costs-budget-policies" aria-labelledby="costs-budget-policies-heading">
      <h3 id="costs-budget-policies-heading" className="costs-panel-title">
        {t("budgetPoliciesTitle")}
      </h3>
      <p className="costs-limits-desc">{t("budgetPoliciesDescription")}</p>

      <form
        className="costs-budget-policies-form"
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          createMutation.mutate();
        }}
      >
        <div className="costs-budget-policies-row">
          <label className="costs-limits-label">
            {t("budgetPolicyScope")}
            <select
              className="costs-limits-input"
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as ScopeForm)}
              aria-label={t("budgetPolicyScope")}
            >
              <option value="project">{t("budgetPolicyScopeProject")}</option>
              <option value="billing_code">{t("budgetPolicyScopeBilling")}</option>
              <option value="company">{t("budgetPolicyScopeCompany")}</option>
            </select>
          </label>
          {scopeType === "project" && (
            <label className="costs-limits-label">
              {t("budgetPolicyProject")}
              <select
                className="costs-limits-input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={t("budgetPolicyProject")}
              >
                <option value="">{t("budgetPolicySelectProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scopeType === "billing_code" && (
            <label className="costs-limits-label">
              {t("budgetPolicyBillingCode")}
              <input
                className="costs-limits-input"
                value={billingCode}
                onChange={(e) => setBillingCode(e.target.value)}
                placeholder={t("budgetPolicyBillingPlaceholder")}
              />
            </label>
          )}
          <label className="costs-limits-label">
            {t("budgetPolicyLimitCents")}
            <input
              type="number"
              min={1}
              step={1}
              className="costs-limits-input"
              value={limitCents}
              onChange={(e) => setLimitCents(e.target.value)}
            />
          </label>
          <label className="costs-limits-label">
            {t("budgetPolicyOnExceed")}
            <select
              className="costs-limits-input"
              value={onExceed}
              onChange={(e) => setOnExceed(e.target.value as BudgetPolicy["onExceed"])}
              aria-label={t("budgetPolicyOnExceed")}
            >
              <option value="record_only">{t("budgetPolicyOnExceedRecord")}</option>
              <option value="block_new_runs_for_scope">{t("budgetPolicyOnExceedBlock")}</option>
              <option value="pause_agents">{t("budgetPolicyOnExceedPause")}</option>
            </select>
          </label>
        </div>
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          {createMutation.isPending ? t("saving", { ns: "common" }) : t("budgetPolicyCreate")}
        </Button>
        {formError && (
          <p className="costs-limits-error" role="alert">
            {formError}
          </p>
        )}
      </form>

      {isLoading ? (
        <p className="costs-panel-empty">{t("loading", { ns: "common" })}</p>
      ) : policies.length === 0 ? (
        <p className="costs-panel-empty">{t("budgetPoliciesEmpty")}</p>
      ) : (
        <div className="costs-breach-table-wrap">
          <table className="costs-breach-table">
            <caption className="sr-only">{t("budgetPoliciesTitle")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("budgetPolicyScope")}</th>
                <th scope="col">{t("budgetPolicyTarget")}</th>
                <th scope="col">{t("budgetPolicyLimitCents")}</th>
                <th scope="col">{t("budgetPolicyOnExceed")}</th>
                <th scope="col">{t("budgetPolicyEnabled")}</th>
                <th scope="col">{t("budgetPolicyActions")}</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>{t(`budgetPolicyScope_${p.scopeType}`)}</td>
                  <td>
                    {p.scopeType === "project"
                      ? projects.find((x) => x.id === p.projectId)?.name ?? p.projectId?.slice(0, 8)
                      : p.scopeType === "billing_code"
                        ? p.billingCode ?? "—"
                        : "—"}
                  </td>
                  <td>{formatCents(p.limitCents)}</td>
                  <td>{t(`budgetPolicyOnExceed_${p.onExceed}`)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) =>
                        patchMutation.mutate({ id: p.id, body: { enabled: e.target.checked } })
                      }
                      aria-label={t("budgetPolicyEnabled")}
                    />
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t("budgetPolicyDeleteConfirm"))) {
                          deleteMutation.mutate(p.id);
                        }
                      }}
                    >
                      {t("budgetPolicyDelete")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
