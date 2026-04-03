import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import "./CompanyBilling.css";

export function BillingCheckoutReturn() {
  const { t } = useTranslation("billing");
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("returnTitle") }]);
  }, [setBreadcrumbs, t]);

  return (
    <div className="company-billing-page">
      <Card className="company-billing-card">
        <CardHeader>{t("returnTitle")}</CardHeader>
        <CardContent>
          <p className="company-billing-sub">{t("returnBody")}</p>
          <p className="company-billing-footnote">
            <Link to="/company/billing">{t("backToBilling")}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
