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
import "./CompanyBilling.css";

export function PricingPage() {
  const { t } = useTranslation("billing");
  const { selectedCompanyId, loading: companiesLoading } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("pricingTitle") }]);
  }, [setBreadcrumbs, t]);

  const companyId = selectedCompanyId ?? "";

  const plansQuery = useQuery({
    queryKey: queryKeys.billing.plans(companyId),
    queryFn: () => billingApi.listPlans(companyId),
    enabled: Boolean(companyId),
  });

  if (companiesLoading || !companyId) {
    return <PageSkeleton />;
  }

  const plans = plansQuery.data?.plans ?? [];

  return (
    <div className="company-billing-page">
      <header className="company-billing-header">
        <h1 className="company-billing-title">{t("pricingTitle")}</h1>
        <p className="company-billing-sub">{t("pricingSubtitle")}</p>
        <p className="company-billing-byok-note">{t("byokChargeSeparationNote")}</p>
      </header>

      <section className="company-billing-plans" aria-label={t("availablePlans")}>
        <div className="company-billing-plan-grid">
          {plans.map((p) => (
            <Card key={p.id} className="company-billing-plan-card">
              <CardHeader>
                <h3 className="company-billing-plan-name">{p.name}</h3>
                <p className="company-billing-plan-desc">{p.description ?? ""}</p>
              </CardHeader>
              <CardContent>
                <PlanEntitlementsList ent={p.entitlements} t={t} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="company-billing-footnote">
        <Link to="/company/billing">{t("backToBilling")}</Link>
      </p>
    </div>
  );
}
