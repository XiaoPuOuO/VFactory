import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { billingApi } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PlanEntitlementsList } from "@/components/PlanEntitlementsList";
import { planTierDisplayDescription, planTierDisplayName } from "@/lib/planLicenseTier";
import "./CompanyBilling.css";

export function CompanyBilling() {
  const { t } = useTranslation("billing");
  const { selectedCompanyId, loading: companiesLoading } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: t("breadcrumbCompany"), href: "/company/settings" },
      { label: t("title") },
    ]);
  }, [setBreadcrumbs, t]);

  const companyId = selectedCompanyId ?? "";

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(companyId),
    queryFn: () => billingApi.listPlans(companyId),
    enabled: Boolean(companyId),
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.billing.company(companyId),
    queryFn: () => billingApi.getCompanyStatus(companyId),
    enabled: Boolean(companyId),
  });

  if (companiesLoading || !companyId) {
    return <PageSkeleton />;
  }

  const plans = plansQuery.data?.plans ?? [];
  const status = statusQuery.data;
  /** 無訂閱列時，後端有效方案回落為 free。 */
  const currentPlanSlug = status?.subscription?.planSlug ?? "free";

  return (
    <div className="company-billing-page">
      <header className="company-billing-header">
        <h1 className="company-billing-title">{t("title")}</h1>
        <p className="company-billing-sub">{t("subtitle")}</p>
        <p className="company-billing-byok-note">{t("byokChargeSeparationNote")}</p>
      </header>

      {status ? (
        <Card className="company-billing-card">
          <CardHeader>{t("currentPlan")}</CardHeader>
          <CardContent>
            <dl className="company-billing-dl">
              <dt>{t("plan")}</dt>
              <dd>
                {status.subscription ? (
                  planTierDisplayName(
                    t,
                    status.subscription.planSlug,
                    status.subscription.planName,
                  )
                ) : (
                  <>
                    {planTierDisplayName(t, "free")}
                    <span className="company-billing-tier-suffix"> — {t("freeTierSuffix")}</span>
                  </>
                )}
              </dd>
              <dt>{t("status")}</dt>
              <dd>{status.subscription?.status ?? "—"}</dd>
              <dt>{t("deploymentModeLabel")}</dt>
              <dd>{t("deploymentModeByok")}</dd>
            </dl>
            <p className="company-billing-costs-hint">{t("costLimitsOnCostsPage")}</p>
            <div className="company-billing-notice">
              <p className="company-billing-notice-title">{t("selfServeDisabledTitle")}</p>
              <p className="company-billing-notice-body">{t("selfServeDisabledBody")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="company-billing-plans" aria-label={t("referenceTiers")}>
        <h2 className="company-billing-h2">{t("referenceTiers")}</h2>
        <div className="company-billing-plan-grid">
          {plans.map((p) => {
            const isCurrent = currentPlanSlug === p.slug;
            return (
              <Card
                key={p.id}
                className={
                  isCurrent
                    ? "company-billing-plan-card company-billing-plan-card--current"
                    : "company-billing-plan-card"
                }
              >
                <CardHeader>
                  <div className="company-billing-plan-card-head">
                    <div className="company-billing-plan-card-titles">
                      <h3 className="company-billing-plan-name">
                        {planTierDisplayName(t, p.slug, p.name)}
                      </h3>
                      <p className="company-billing-plan-desc">
                        {planTierDisplayDescription(t, p.slug, p.description)}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="company-billing-current-badge">{t("currentPlanBadge")}</span>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <PlanEntitlementsList ent={p.entitlements} t={t} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <p className="company-billing-footnote">
        <Link to="/pricing">{t("viewLicensePage")}</Link>
      </p>
    </div>
  );
}
