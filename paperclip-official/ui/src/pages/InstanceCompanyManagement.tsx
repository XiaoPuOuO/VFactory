import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Building2, Eraser, ExternalLink, FolderOpen, Settings2, Trash2 } from "lucide-react";
import { Link } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../api/client";
import { companiesApi, type CompanySubscriptionSummary } from "../api/companies";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./InstanceCompanyManagement.css";

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isManualSubscriptionExpired(sub: CompanySubscriptionSummary | null | undefined): boolean {
  if (!sub || sub.paymentProvider !== "manual" || sub.currentPeriodEnd == null) return false;
  return new Date(sub.currentPeriodEnd).getTime() < Date.now();
}

/**
 * 此站設定 > Company 管理
 * 列出所有公司，提供進入公司、手動指定方案期限、此站預設公司路徑，以及封存/刪除維運操作。
 */
export function InstanceCompanyManagement() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const { companies, loading, error } = useCompany();
  const { openOnboarding } = useDialog();
  const queryClient = useQueryClient();

  const [planDialogCompanyId, setPlanDialogCompanyId] = useState<string | null>(null);
  const [planFormPlanId, setPlanFormPlanId] = useState("");
  const [planFormPermanent, setPlanFormPermanent] = useState(true);
  const [planFormEndLocal, setPlanFormEndLocal] = useState("");

  const [defaultCompanyPathValue, setDefaultCompanyPathValue] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
    enabled: companies.length > 0,
  });

  const { data: planOptions, error: planOptionsError } = useQuery({
    queryKey: ["instance", "settings", "plan-assign-options"] as const,
    queryFn: () => instanceSettingsApi.getPlanAssignOptions(),
    enabled: planDialogCompanyId != null,
  });

  const planDialogCompany = useMemo(
    () => (planDialogCompanyId ? companies.find((c) => c.id === planDialogCompanyId) : null),
    [companies, planDialogCompanyId],
  );

  const { data: defaultCompanyPathData, isLoading: defaultCompanyPathLoading } = useQuery({
    queryKey: queryKeys.instanceSettings.defaultCompanyPath,
    queryFn: () => instanceSettingsApi.getDefaultCompanyPath(),
  });

  useEffect(() => {
    if (defaultCompanyPathData?.defaultCompanyPath != null) {
      setDefaultCompanyPathValue(defaultCompanyPathData.defaultCompanyPath);
    }
  }, [defaultCompanyPathData?.defaultCompanyPath]);

  const saveDefaultCompanyPathMutation = useMutation({
    mutationFn: (value: string) => instanceSettingsApi.setDefaultCompanyPath(value),
    onSuccess: (_, submitted) => {
      setDefaultCompanyPathValue(submitted);
      void queryClient.invalidateQueries({ queryKey: queryKeys.instanceSettings.defaultCompanyPath });
      pushToast({ title: t("instance.defaultCompanyPathSaved"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.defaultCompanyPathSaveFailed"),
        tone: "error",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (companyId: string) => companiesApi.remove(companyId),
    onSuccess: () => {
      setActionError(null);
      setConfirmRemoveId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : t("instance.failedRemoveCompany"));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (companyId: string) => companiesApi.archive(companyId),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : t("instance.failedArchiveCompany"));
    },
  });

  const cleanupOrphansMutation = useMutation({
    mutationFn: () => companiesApi.cleanupOrphans(),
    onSuccess: () => {
      setActionError(null);
      pushToast({ title: t("instance.cleanupOrphansSuccess"), tone: "success" });
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : t("instance.cleanupOrphansFailed"));
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: (args: { companyId: string; planId: string; currentPeriodEnd: string | null }) =>
      companiesApi.updateManualSubscription(args.companyId, {
        planId: args.planId,
        currentPeriodEnd: args.currentPeriodEnd,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      setPlanDialogCompanyId(null);
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.companyManagement") },
    ]);
  }, [setBreadcrumbs, t]);

  useEffect(() => {
    if (planDialogCompanyId == null || !planOptions?.plans?.length) return;
    const sub = stats?.[planDialogCompanyId]?.subscription;
    const firstId = planOptions.plans[0]?.id ?? "";
    if (sub?.planId) {
      setPlanFormPlanId(sub.planId);
    } else {
      setPlanFormPlanId(firstId);
    }
    if (sub?.currentPeriodEnd == null) {
      setPlanFormPermanent(true);
      setPlanFormEndLocal("");
    } else {
      setPlanFormPermanent(false);
      setPlanFormEndLocal(isoToDatetimeLocalValue(sub.currentPeriodEnd));
    }
  }, [planDialogCompanyId, planOptions, stats]);

  function openPlanDialog(companyId: string) {
    setPlanDialogCompanyId(companyId);
  }

  function submitPlanForm() {
    if (!planDialogCompanyId || !planFormPlanId) return;
    const currentPeriodEnd = planFormPermanent
      ? null
      : planFormEndLocal.trim()
        ? new Date(planFormEndLocal).toISOString()
        : null;
    if (!planFormPermanent && !planFormEndLocal.trim()) {
      return;
    }
    updatePlanMutation.mutate({
      companyId: planDialogCompanyId,
      planId: planFormPlanId,
      currentPeriodEnd,
    });
  }

  const currentStoredDefaultCompanyPath = defaultCompanyPathData?.defaultCompanyPath ?? "";
  const isDefaultCompanyPathDirty = defaultCompanyPathValue.trim() !== currentStoredDefaultCompanyPath;

  function submitDefaultCompanyPath(e: React.FormEvent) {
    e.preventDefault();
    saveDefaultCompanyPathMutation.mutate(defaultCompanyPathValue.trim());
  }

  const runCleanupOrphans = () => {
    if (!window.confirm(t("instance.cleanupOrphansConfirm"))) return;
    cleanupOrphansMutation.mutate();
  };

  if (loading) {
    return (
      <div className="instance-company-management-page">
        <p className="instance-company-management-loading">{t("instance.loadingCompanies")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="instance-company-management-page">
        <p className="instance-company-management-error">
          {error instanceof Error ? error.message : t("instance.failedLoadCompanies")}
        </p>
      </div>
    );
  }

  return (
    <div className="instance-company-management-page">
      <div className="instance-company-management-header">
        <div className="instance-company-management-title-wrap">
          <Building2 />
          <h1 className="instance-company-management-title">
            {t("instance.companyManagement")}
          </h1>
        </div>
        <p className="instance-company-management-desc">
          {t("instance.companyManagementDesc")}
        </p>
        <div className="instance-company-management-header-actions">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="instance-company-management-add-btn"
            onClick={() => openOnboarding({ creationMode: "template" })}
          >
            {t("instance.addCompanyFromTemplate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="instance-company-management-add-btn"
            onClick={() => openOnboarding({ creationMode: "blank" })}
          >
            {t("instance.addCompanyBlank")}
          </Button>
        </div>
      </div>

      <Card className="instance-company-default-path-card">
        <CardContent className="instance-company-default-path-card-content">
          <div className="instance-company-default-path-header">
            <div className="instance-company-default-path-title-row">
              <FolderOpen className="instance-company-default-path-icon" />
              <div className="instance-company-default-path-title-stack">
                <div className="instance-company-default-path-title">{t("instance.defaultCompanyPath")}</div>
                <p className="instance-company-default-path-desc">{t("instance.defaultCompanyPathDesc")}</p>
              </div>
            </div>
          </div>
          <form onSubmit={submitDefaultCompanyPath} className="instance-company-default-path-form">
            <Label htmlFor="instance-default-company-path-input">{t("instance.defaultCompanyPath")}</Label>
            <Input
              id="instance-default-company-path-input"
              type="text"
              value={defaultCompanyPathValue}
              onChange={(e) => setDefaultCompanyPathValue(e.target.value)}
              placeholder="/var/paperclip/companies"
              disabled={defaultCompanyPathLoading}
            />
            <div className="instance-company-default-path-actions">
              <Button
                type="submit"
                disabled={saveDefaultCompanyPathMutation.isPending || !isDefaultCompanyPathDirty || defaultCompanyPathLoading}
              >
                {saveDefaultCompanyPathMutation.isPending ? "…" : t("common.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {actionError ? (
        <div className="instance-company-management-action-banner" role="alert">
          {actionError}
        </div>
      ) : null}

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          message={t("instance.noCompaniesYet")}
        />
      ) : (
        <Card>
          <CardContent className="instance-company-management-card-content">
            <div className="instance-company-management-table-toolbar">
              <div className="instance-company-management-table-toolbar-spacer" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="instance-company-management-cleanup-btn"
                disabled={cleanupOrphansMutation.isPending}
                onClick={runCleanupOrphans}
                title={t("instance.cleanupOrphansTooltip")}
              >
                <Eraser className="instance-company-management-action-icon" />
                {cleanupOrphansMutation.isPending ? t("common.loading") : t("instance.cleanupOrphans")}
              </Button>
            </div>
            <table className="instance-company-management-table">
              <thead>
                <tr>
                  <th className="instance-company-management-th-name">{t("instance.companyName")}</th>
                  <th className="instance-company-management-th-desc">{t("instance.companyDescription")}</th>
                  <th className="instance-company-management-th-status">{t("instance.companyStatus")}</th>
                  <th className="instance-company-management-th-prefix">{t("instance.issuePrefix")}</th>
                  <th className="instance-company-management-th-plan">{t("instance.companyPlanColumn")}</th>
                  <th className="instance-company-management-th-agents">{t("instance.agentCount")}</th>
                  <th className="instance-company-management-th-issues">{t("instance.issueCount")}</th>
                  <th className="instance-company-management-th-actions">{t("instance.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const companyStats = stats?.[company.id];
                  const agentCount = companyStats?.agentCount ?? 0;
                  const issueCount = companyStats?.issueCount ?? 0;
                  const sub = companyStats?.subscription;
                  const expired = isManualSubscriptionExpired(sub);
                  const statusClass =
                    company.status === "active"
                      ? "active"
                      : company.status === "paused"
                        ? "paused"
                        : "archived";
                  const isArchived = company.status === "archived";
                  const isConfirmingRemove = confirmRemoveId === company.id;

                  let planSummary = t("instance.companyPlanDefaultFree");
                  if (sub) {
                    if (sub.paymentProvider === "manual") {
                      if (expired) {
                        planSummary = t("instance.companyPlanExpiredFallback", { name: sub.planName });
                      } else if (sub.currentPeriodEnd == null) {
                        planSummary = t("instance.companyPlanManualPermanent", { name: sub.planName });
                      } else {
                        planSummary = t("instance.companyPlanManualUntil", {
                          name: sub.planName,
                          date: new Date(sub.currentPeriodEnd).toLocaleString(),
                        });
                      }
                    } else {
                      planSummary = t("instance.companyPlanBillingManaged", { name: sub.planName });
                    }
                  }

                  return (
                    <tr key={company.id}>
                      <td className="instance-company-management-td-name">{company.name}</td>
                      <td className="instance-company-management-td-desc">
                        {company.description ?? "—"}
                      </td>
                      <td className="instance-company-management-td-status">
                        <span className={`instance-company-management-status ${statusClass}`}>
                          {company.status}
                        </span>
                      </td>
                      <td className="instance-company-management-td-prefix">
                        <code className="instance-company-management-prefix-code">{company.issuePrefix}</code>
                      </td>
                      <td className="instance-company-management-td-plan">
                        <span
                          className={
                            expired
                              ? "instance-company-management-plan-text instance-company-management-plan-expired"
                              : "instance-company-management-plan-text"
                          }
                        >
                          {planSummary}
                        </span>
                      </td>
                      <td className="instance-company-management-td-agents">{agentCount}</td>
                      <td className="instance-company-management-td-issues">{issueCount}</td>
                      <td className="instance-company-management-td-actions">
                        <div className="instance-company-management-action-cell">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="instance-company-management-plan-btn"
                            onClick={() => openPlanDialog(company.id)}
                          >
                            <Settings2 className="instance-company-management-action-icon" />
                            {t("instance.setCompanyPlan")}
                          </Button>
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/${encodeURIComponent(company.issuePrefix)}/dashboard`}>
                              <ExternalLink className="instance-company-management-action-icon" />
                              {t("instance.enterCompany")}
                            </Link>
                          </Button>
                          {!isArchived ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="instance-company-management-plan-btn"
                              disabled={archiveMutation.isPending}
                              onClick={() => archiveMutation.mutate(company.id)}
                            >
                              <Archive className="instance-company-management-action-icon" />
                              {t("instance.archiveCompany")}
                            </Button>
                          ) : null}
                          {isArchived &&
                            (!isConfirmingRemove ? (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="instance-company-management-plan-btn"
                                onClick={() => setConfirmRemoveId(company.id)}
                              >
                                <Trash2 className="instance-company-management-action-icon" />
                                {t("instance.deleteCompanyPermanently")}
                              </Button>
                            ) : (
                              <div className="instance-company-management-confirm-box">
                                <span className="instance-company-management-confirm-text">
                                  {t("instance.confirmDeleteCompany")}
                                </span>
                                <div className="instance-company-management-confirm-actions">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setConfirmRemoveId(null)}
                                    disabled={removeMutation.isPending}
                                  >
                                    {t("common.cancel")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => removeMutation.mutate(company.id)}
                                    disabled={removeMutation.isPending}
                                  >
                                    {removeMutation.isPending
                                      ? t("instance.deleting")
                                      : t("instance.deleteCompanyPermanently")}
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={planDialogCompanyId != null}
        onOpenChange={(open) => {
          if (!open) {
            setPlanDialogCompanyId(null);
            updatePlanMutation.reset();
          }
        }}
      >
        <DialogContent className="instance-company-plan-dialog">
          <DialogHeader>
            <DialogTitle>{t("instance.companyPlanDialogTitle")}</DialogTitle>
            <DialogDescription>
              {planDialogCompany
                ? t("instance.companyPlanDialogDesc", { name: planDialogCompany.name })
                : null}
            </DialogDescription>
          </DialogHeader>
          {planOptionsError ? (
            <p className="instance-company-management-error" role="alert">
              {t("instance.companyPlanLoadOptionsFailed")}
            </p>
          ) : null}
          <div className="instance-company-plan-dialog-body">
            <div className="instance-company-plan-field">
              <Label htmlFor="instance-company-plan-select">{t("instance.companyPlanSelectPlan")}</Label>
              <select
                id="instance-company-plan-select"
                className="instance-company-plan-select"
                value={planFormPlanId}
                onChange={(e) => setPlanFormPlanId(e.target.value)}
                disabled={!planOptions?.plans?.length}
              >
                {(planOptions?.plans ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="instance-company-plan-fieldset">
              <legend className="instance-company-plan-legend">{t("instance.companyPlanDurationMode")}</legend>
              <label className="instance-company-plan-radio-row">
                <input
                  type="radio"
                  name="plan-duration"
                  checked={planFormPermanent}
                  onChange={() => setPlanFormPermanent(true)}
                />
                <span>{t("instance.companyPlanDurationPermanent")}</span>
              </label>
              <label className="instance-company-plan-radio-row">
                <input
                  type="radio"
                  name="plan-duration"
                  checked={!planFormPermanent}
                  onChange={() => setPlanFormPermanent(false)}
                />
                <span>{t("instance.companyPlanDurationUntil")}</span>
              </label>
            </fieldset>
            {!planFormPermanent ? (
              <div className="instance-company-plan-field">
                <Label htmlFor="instance-company-plan-end">{t("instance.companyPlanEndDate")}</Label>
                <input
                  id="instance-company-plan-end"
                  type="datetime-local"
                  className="instance-company-plan-datetime"
                  value={planFormEndLocal}
                  onChange={(e) => setPlanFormEndLocal(e.target.value)}
                />
              </div>
            ) : null}
            {updatePlanMutation.isError ? (
              <p className="instance-company-management-error" role="alert">
                {updatePlanMutation.error instanceof ApiError
                  ? updatePlanMutation.error.message
                  : t("instance.companyPlanSaveFailed")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlanDialogCompanyId(null)}
            >
              {t("instance.companyPlanCancel")}
            </Button>
            <Button
              type="button"
              disabled={
                updatePlanMutation.isPending ||
                !planFormPlanId ||
                (!planFormPermanent && !planFormEndLocal.trim())
              }
              onClick={() => submitPlanForm()}
            >
              {t("instance.companyPlanSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
