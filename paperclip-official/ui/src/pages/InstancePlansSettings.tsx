import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Plus, X } from "lucide-react";
import { Link, Navigate } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { meApi, canAccessInstancePricing } from "../api/me";
import { instancePlansApi } from "../api/instance-plans";
import { ApiError } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { InstancePlanRow } from "@paperclipai/shared";
import { PageSkeleton } from "@/components/PageSkeleton";
import "./InstancePlansSettings.css";

const emptyForm = () => ({
  slug: "",
  name: "",
  description: "",
  entitlementsJson: "{\n}",
  externalRefsJson: "{\n}",
  intervalDays: "30",
  sortOrder: "0",
  catalogVisible: true,
  active: true,
  allowedCompanyIds: new Set<string>(),
});

type FormState = ReturnType<typeof emptyForm>;

function rowToForm(p: InstancePlanRow): FormState {
  return {
    slug: p.slug,
    name: p.name,
    description: p.description ?? "",
    entitlementsJson: JSON.stringify(p.entitlements ?? {}, null, 2),
    externalRefsJson: JSON.stringify(p.externalRefs ?? {}, null, 2),
    intervalDays: String(p.intervalDays),
    sortOrder: String(p.sortOrder),
    catalogVisible: p.catalogVisible,
    active: p.active,
    allowedCompanyIds: new Set(p.allowedCompanyIds ?? []),
  };
}

function parseExternalRefs(json: string): Record<string, string> {
  const v = JSON.parse(json) as unknown;
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("object");
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== "string") throw new Error("strings");
    out[k] = val;
  }
  return out;
}

export function InstancePlansSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { companies, loading: companiesLoading } = useCompany();

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState("");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi.get(),
    retry: false,
  });
  const pricingAllowed = canAccessInstancePricing(meQuery.data);

  const plansQuery = useQuery({
    queryKey: queryKeys.instancePlans.all,
    queryFn: async () => (await instancePlansApi.list()).plans,
    enabled: meQuery.isSuccess && pricingAllowed,
  });

  const invalidatePlansCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.instancePlans.all });
    void queryClient.invalidateQueries({ queryKey: ["billing", "plans"], exact: false });
  }, [queryClient]);

  const closeForm = () => {
    setIsFormVisible(false);
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const createMut = useMutation({
    mutationFn: instancePlansApi.create,
    onSuccess: () => {
      invalidatePlansCaches();
      closeForm();
    },
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.message : t("instance.planSaveFailed"));
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof instancePlansApi.update>[1] }) =>
      instancePlansApi.update(id, body),
    onSuccess: () => {
      invalidatePlansCaches();
      closeForm();
    },
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.message : t("instance.planSaveFailed"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: instancePlansApi.remove,
    onSuccess: () => {
      invalidatePlansCaches();
      if (editingId) {
        closeForm();
      }
    },
    onError: (e: unknown) => {
      setFormError(e instanceof ApiError ? e.message : t("instance.planDeactivateFailed"));
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings"), href: "/instance/settings" },
      { label: t("instance.planManagement") },
    ]);
  }, [setBreadcrumbs, t]);

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return sortedCompanies;
    const q = companySearch.toLowerCase();
    return sortedCompanies.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.id.toLowerCase().includes(q)
    );
  }, [sortedCompanies, companySearch]);

  const plans = plansQuery.data ?? [];

  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setIsFormVisible(true);
    setTimeout(() => {
      document.getElementById("plan-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const startEdit = (p: InstancePlanRow) => {
    setEditingId(p.id);
    setForm(rowToForm(p));
    setFormError(null);
    setIsFormVisible(true);
    setTimeout(() => {
      document.getElementById("plan-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const toggleAllowed = (companyId: string, checked: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.allowedCompanyIds);
      if (checked) next.add(companyId);
      else next.delete(companyId);
      return { ...prev, allowedCompanyIds: next };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    let entitlements: Record<string, unknown>;
    try {
      const parsed = JSON.parse(form.entitlementsJson) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setFormError(t("instance.invalidJsonEntitlements"));
        return;
      }
      entitlements = parsed as Record<string, unknown>;
    } catch {
      setFormError(t("instance.invalidJsonEntitlements"));
      return;
    }

    let externalRefs: Record<string, string>;
    try {
      externalRefs = parseExternalRefs(form.externalRefsJson);
    } catch (err) {
      setFormError(
        err instanceof Error && err.message === "strings"
          ? t("instance.externalRefsMustBeStrings")
          : t("instance.invalidJsonExternalRefs"),
      );
      return;
    }

    const intervalDays = Number.parseInt(form.intervalDays, 10);
    const sortOrder = Number.parseInt(form.sortOrder, 10);
    if (!Number.isFinite(intervalDays) || intervalDays < 1) {
      setFormError(t("instance.planIntervalInvalid"));
      return;
    }
    if (!Number.isFinite(sortOrder)) {
      setFormError(t("instance.planSortInvalid"));
      return;
    }

    const allowedCompanyIds = [...form.allowedCompanyIds];

    if (editingId) {
      updateMut.mutate({
        id: editingId,
        body: {
          name: form.name.trim(),
          description: form.description.trim() === "" ? null : form.description.trim(),
          entitlements,
          externalRefs,
          intervalDays,
          sortOrder,
          active: form.active,
          catalogVisible: form.catalogVisible,
          allowedCompanyIds,
        },
      });
    } else {
      const slug = form.slug.trim();
      if (!slug) {
        setFormError(t("instance.planSlugRequired"));
        return;
      }
      createMut.mutate({
        slug,
        name: form.name.trim(),
        description: form.description.trim() === "" ? null : form.description.trim(),
        entitlements,
        externalRefs,
        intervalDays,
        sortOrder,
        active: form.active,
        catalogVisible: form.catalogVisible,
        allowedCompanyIds,
      });
    }
  };

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  if (meQuery.isLoading) {
    return <PageSkeleton />;
  }

  if (!pricingAllowed) {
    return <Navigate to="/instance/settings" replace />;
  }

  if (plansQuery.isLoading || companiesLoading) {
    return (
      <div className="instance-plans-page">
        <p className="instance-plans-muted">{t("instance.loadingCompanies")}</p>
      </div>
    );
  }

  if (plansQuery.error) {
    return (
      <div className="instance-plans-page">
        <p className="instance-plans-error">
          {plansQuery.error instanceof Error ? plansQuery.error.message : t("instance.plansLoadFailed")}
        </p>
      </div>
    );
  }

  return (
    <div className="instance-plans-page">
      <div className="instance-plans-header">
        <div className="instance-plans-title-wrap">
          <CreditCard aria-hidden className="instance-plans-icon" />
          <h1 className="instance-plans-title">{t("instance.planManagement")}</h1>
        </div>
        <p className="instance-plans-desc">{t("instance.planManagementDesc")}</p>
        <Link to="/instance/settings" className="instance-plans-back">
          {t("instance.backToInstanceSettings")}
        </Link>
      </div>

      <Card className="instance-plans-table-card">
        <CardHeader className="instance-plans-table-card-header">
          <h2 className="instance-plans-section-title">{t("instance.plansTableTitle", "已建立的方案")}</h2>
          <Button onClick={startNew} disabled={busy || isFormVisible} className="btn-primary">
            <Plus className="w-4 h-4 mr-1" />
            {t("instance.newPlan")}
          </Button>
        </CardHeader>
        <CardContent className="instance-plans-table-wrap">
          {plans.length === 0 ? (
            <p className="instance-plans-muted">{t("instance.planListEmpty")}</p>
          ) : (
            <table className="instance-plans-table">
              <thead>
                <tr>
                  <th>{t("instance.colSlug")}</th>
                  <th>{t("instance.colName")}</th>
                  <th>{t("instance.colCatalog")}</th>
                  <th>{t("instance.colAllowed")}</th>
                  <th>{t("instance.colInterval")}</th>
                  <th>{t("instance.colActive")}</th>
                  <th>{t("instance.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="instance-plans-mono">{p.slug}</td>
                    <td>{p.name}</td>
                    <td>{p.catalogVisible ? t("instance.publicCatalog", "公開") : t("instance.hiddenCatalog", "隱藏")}</td>
                    <td>
                      {p.allowedCompanyIds.length > 0
                        ? t("instance.companiesCount", { count: p.allowedCompanyIds.length })
                        : t("instance.anyCompany", "全部")}
                    </td>
                    <td>{p.intervalDays}</td>
                    <td>{p.active ? t("instance.on", "啟用") : t("instance.off", "關閉")}</td>
                    <td>
                      <div className="instance-plans-row-actions">
                        <Button type="button" size="sm" variant="outline" className="btn-outline" onClick={() => startEdit(p)}>
                          {t("instance.editPlan")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="btn-destructive"
                          disabled={busy || !p.active}
                          onClick={() => {
                            if (window.confirm(t("instance.confirmDeactivatePlan"))) {
                              deleteMut.mutate(p.id);
                            }
                          }}
                        >
                          {t("instance.deactivatePlan")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {isFormVisible && (
        <form id="plan-editor" className="instance-plans-editor-layout" onSubmit={submit}>
          <div className="instance-plans-editor-header">
            <h2 className="instance-plans-editor-title">
              {editingId ? t("instance.editPlan") : t("instance.newPlan")}
            </h2>
            <Button type="button" variant="ghost" className="instance-plans-close-btn" onClick={closeForm} disabled={busy}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          
          <Card className="instance-plans-form-card">
            <CardContent className="instance-plans-form-content instance-plans-form-all-in-one">
              {/* 基本資訊 */}
              <div className="instance-plans-form-section">
                <h3 className="instance-plans-sub-title">基本資訊</h3>
                {!editingId ? (
                  <div className="instance-plans-field">
                    <Label htmlFor="plan-slug">{t("instance.planSlug")}</Label>
                    <Input
                      id="plan-slug"
                      value={form.slug}
                      onChange={(ev) => setForm((f) => ({ ...f, slug: ev.target.value }))}
                      autoComplete="off"
                      disabled={busy}
                    />
                    <p className="instance-plans-hint">{t("instance.planSlugHint")}</p>
                  </div>
                ) : (
                  <div className="instance-plans-field">
                    <Label>{t("instance.planSlug")}</Label>
                    <p className="instance-plans-readonly">{form.slug}</p>
                  </div>
                )}

                <div className="instance-plans-field">
                  <Label htmlFor="plan-name">{t("instance.planName")}</Label>
                  <Input
                    id="plan-name"
                    value={form.name}
                    onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                    required
                    disabled={busy}
                  />
                </div>

                <div className="instance-plans-field">
                  <Label htmlFor="plan-desc">{t("instance.planDescription")}</Label>
                  <Textarea
                    id="plan-desc"
                    value={form.description}
                    onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
                    rows={2}
                    disabled={busy}
                  />
                </div>
              </div>

              {/* 規則與顯示 */}
              <div className="instance-plans-form-section">
                <h3 className="instance-plans-sub-title">規則與顯示</h3>
                <div className="instance-plans-row">
                  <div className="instance-plans-field instance-plans-field--inline">
                    <Label htmlFor="plan-interval">{t("instance.intervalDays")}</Label>
                    <Input
                      id="plan-interval"
                      type="number"
                      min={1}
                      value={form.intervalDays}
                      onChange={(ev) => setForm((f) => ({ ...f, intervalDays: ev.target.value }))}
                      disabled={busy}
                    />
                  </div>
                  <div className="instance-plans-field instance-plans-field--inline">
                    <Label htmlFor="plan-sort">{t("instance.sortOrder")}</Label>
                    <Input
                      id="plan-sort"
                      type="number"
                      value={form.sortOrder}
                      onChange={(ev) => setForm((f) => ({ ...f, sortOrder: ev.target.value }))}
                      disabled={busy}
                    />
                  </div>
                </div>

                <div className="instance-plans-check-row">
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      id="plan-catalog"
                      checked={form.catalogVisible}
                      onChange={(e) => setForm((f) => ({ ...f, catalogVisible: e.target.checked }))}
                      disabled={busy}
                    />
                    <span className="ios-slider"></span>
                  </label>
                  <div className="instance-plans-check-labels">
                    <Label htmlFor="plan-catalog" className="instance-plans-check-main">
                      {t("instance.catalogVisible")}
                    </Label>
                    <p className="instance-plans-hint">{t("instance.catalogVisibleHint")}</p>
                  </div>
                </div>

                <div className="instance-plans-check-row">
                  <label className="ios-switch">
                    <input
                      type="checkbox"
                      id="plan-active"
                      checked={form.active}
                      onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                      disabled={busy}
                    />
                    <span className="ios-slider"></span>
                  </label>
                  <div className="instance-plans-check-labels">
                    <Label htmlFor="plan-active" className="instance-plans-check-main">
                      {t("instance.planActive")}
                    </Label>
                  </div>
                </div>
              </div>

              {/* 存取權限 */}
              <div className="instance-plans-form-section">
                <h3 className="instance-plans-sub-title">存取權限</h3>
                <div className="instance-plans-field">
                  <span className="instance-plans-label-block">{t("instance.allowedCompanies")}</span>
                  <p className="instance-plans-hint">{t("instance.allowedCompaniesHint")}</p>
                  
                  <input
                    type="text"
                    className="instance-plans-company-search"
                    placeholder="搜尋公司名稱或 UUID..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                  />

                  <div className="instance-plans-company-box" role="group" aria-label={t("instance.allowedCompanies")}>
                    {filteredCompanies.length === 0 ? (
                      <p className="instance-plans-muted">{t("instance.noCompaniesYet")}</p>
                    ) : (
                      filteredCompanies.map((c) => (
                        <label key={c.id} className="instance-plans-company-row">
                          <Checkbox
                            checked={form.allowedCompanyIds.has(c.id)}
                            onCheckedChange={(ch) => toggleAllowed(c.id, ch === true)}
                            disabled={busy}
                          />
                          <span className="instance-plans-company-name">{c.name}</span>
                          <span className="instance-plans-company-id">{c.id}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* 進階設定 */}
              <div className="instance-plans-form-section">
                <h3 className="instance-plans-sub-title">進階設定</h3>
                <div className="instance-plans-field">
                  <Label htmlFor="plan-ent">{t("instance.entitlementsJson")}</Label>
                  <Textarea
                    id="plan-ent"
                    value={form.entitlementsJson}
                    onChange={(ev) => setForm((f) => ({ ...f, entitlementsJson: ev.target.value }))}
                    className="instance-plans-json"
                    spellCheck={false}
                    disabled={busy}
                  />
                </div>

                <div className="instance-plans-field">
                  <Label htmlFor="plan-ext">{t("instance.externalRefsJson")}</Label>
                  <p className="instance-plans-hint">{t("instance.externalRefsJsonHint")}</p>
                  <Textarea
                    id="plan-ext"
                    value={form.externalRefsJson}
                    onChange={(ev) => setForm((f) => ({ ...f, externalRefsJson: ev.target.value }))}
                    className="instance-plans-json"
                    spellCheck={false}
                    disabled={busy}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {formError && (
            <div className="instance-plans-error-bar">
              <p className="instance-plans-error">{formError}</p>
            </div>
          )}

          <div className="instance-plans-actions-bar">
            <Button type="button" variant="outline" onClick={closeForm} disabled={busy} className="btn-outline">
              {t("instance.cancelEdit")}
            </Button>
            <Button type="submit" disabled={busy} className="btn-primary">
              {t("instance.savePlan")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
