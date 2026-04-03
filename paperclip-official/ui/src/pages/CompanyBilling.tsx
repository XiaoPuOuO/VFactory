import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { billingApi, type CheckoutSessionResponse } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { PageSkeleton } from "../components/PageSkeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlanEntitlementsList } from "@/components/PlanEntitlementsList";
import "./CompanyBilling.css";

function EcpayAutoForm({ actionUrl, fields }: { actionUrl: string; fields: Record<string, string> }) {
  const { t } = useTranslation("billing");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    ref.current?.submit();
  }, [actionUrl, fields]);
  return (
    <form ref={ref} method="post" action={actionUrl} className="company-billing-ecpay-form">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <p className="company-billing-ecpay-hint">{t("ecpayRedirectHint")}</p>
      <Button type="submit" variant="secondary">
        {t("ecpayContinueSubmit")}
      </Button>
    </form>
  );
}

export function CompanyBilling() {
  const { t } = useTranslation("billing");
  const { selectedCompanyId, loading: companiesLoading } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [pendingCheckout, setPendingCheckout] = useState<CheckoutSessionResponse | null>(null);

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

  const checkoutMut = useMutation({
    mutationFn: (input: { planSlug: string; currency: "usd" | "twd"; paymentProvider?: "stripe" | "ecpay" }) =>
      billingApi.checkout(companyId, {
        planSlug: input.planSlug,
        currency: input.currency,
        paymentProvider: input.paymentProvider,
      }),
    onSuccess: (data) => {
      if (data.kind === "stripe_redirect") {
        window.location.assign(data.url);
        return;
      }
      setPendingCheckout(data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.company(companyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.plans(companyId) });
    },
  });

  const portalMut = useMutation({
    mutationFn: () => billingApi.portal(companyId),
    onSuccess: (data) => {
      if (data.url) window.location.assign(data.url);
    },
  });

  if (companiesLoading || !companyId) {
    return <PageSkeleton />;
  }

  const plans = plansQuery.data?.plans ?? [];
  const status = statusQuery.data;

  return (
    <div className="company-billing-page">
      <header className="company-billing-header">
        <h1 className="company-billing-title">{t("title")}</h1>
        <p className="company-billing-sub">{t("subtitle")}</p>
        <p className="company-billing-byok-note">{t("byokChargeSeparationNote")}</p>
      </header>

      {pendingCheckout?.kind === "ecpay_form" ? (
        <Card className="company-billing-card">
          <CardHeader>{t("ecpayRedirect")}</CardHeader>
          <CardContent>
            <EcpayAutoForm actionUrl={pendingCheckout.actionUrl} fields={pendingCheckout.fields} />
          </CardContent>
        </Card>
      ) : null}

      {status ? (
        <Card className="company-billing-card">
          <CardHeader>{t("currentPlan")}</CardHeader>
          <CardContent>
            <dl className="company-billing-dl">
              <dt>{t("plan")}</dt>
              <dd>{status.subscription?.planName ?? t("freeTier")}</dd>
              <dt>{t("status")}</dt>
              <dd>{status.subscription?.status ?? "—"}</dd>
            </dl>
            <p className="company-billing-costs-hint">{t("costLimitsOnCostsPage")}</p>
            {status.subscription?.paymentProvider === "stripe" ? (
              <Button
                type="button"
                variant="outline"
                className="company-billing-portal"
                disabled={portalMut.isPending}
                onClick={() => portalMut.mutate()}
              >
                {t("openStripePortal")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="company-billing-plans" aria-label={t("availablePlans")}>
        <h2 className="company-billing-h2">{t("availablePlans")}</h2>
        <div className="company-billing-plan-grid">
          {plans.map((p) => (
            <Card key={p.id} className="company-billing-plan-card">
              <CardHeader>
                <h3 className="company-billing-plan-name">{p.name}</h3>
                <p className="company-billing-plan-desc">{p.description ?? ""}</p>
              </CardHeader>
              <CardContent>
                <PlanEntitlementsList ent={p.entitlements} t={t} />
                <div className="company-billing-plan-actions">
                  <Button
                    type="button"
                    disabled={checkoutMut.isPending || p.slug === "free"}
                    onClick={() =>
                      checkoutMut.mutate({ planSlug: p.slug, currency: "usd", paymentProvider: "stripe" })
                    }
                  >
                    {t("subscribeStripe")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={checkoutMut.isPending || p.slug === "free"}
                    onClick={() =>
                      checkoutMut.mutate({ planSlug: p.slug, currency: "twd", paymentProvider: "ecpay" })
                    }
                  >
                    {t("subscribeEcpay")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="company-billing-footnote">
        <Link to="/pricing">{t("viewPricingPage")}</Link>
      </p>
    </div>
  );
}
