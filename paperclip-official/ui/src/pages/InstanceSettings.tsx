import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Archive, Building2, CreditCard, FolderOpen, Settings, Shield, Users, UserCog } from "lucide-react";
import { Link } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { meApi, canAccessInstancePricing } from "../api/me";
import { Card, CardContent } from "@/components/ui/card";
import "./InstanceSettings.css";

export function InstanceSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi.get(),
    retry: false,
  });
  const showPlanManagement = canAccessInstancePricing(me);

  useEffect(() => {
    setBreadcrumbs([{ label: t("instance.instanceSettings") }]);
  }, [setBreadcrumbs, t]);

  return (
    <div className="instance-settings-page">
      <div className="instance-settings-header">
        <div className="instance-settings-title-row">
          <Settings />
          <h1 className="instance-settings-title">{t("instance.instanceSettings")}</h1>
        </div>
        <p className="instance-settings-desc">
          {t("instance.instanceSettingsDesc")}
        </p>
      </div>

      <Card className="instance-settings-card">
        <Link to="/instance/users" className="instance-settings-card-link">
          <UserCog />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.userManagement")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.userManagementDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>

      {showPlanManagement ? (
        <Card className="instance-settings-card">
          <Link to="/instance/plans" className="instance-settings-card-link">
            <CreditCard />
            <CardContent className="instance-settings-card-body">
              <div className="instance-settings-card-label">{t("instance.planManagement")}</div>
              <p className="instance-settings-card-desc">{t("instance.planManagementDesc")}</p>
            </CardContent>
          </Link>
        </Card>
      ) : null}

      <Card className="instance-settings-card">
        <Link to="/instance/default-company-path" className="instance-settings-card-link">
          <FolderOpen />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.defaultCompanyPath")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.defaultCompanyPathDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>

      <Card className="instance-settings-card">
        <Link to="/instance/compliance-retention" className="instance-settings-card-link">
          <Shield />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.complianceDefaultRetention")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.complianceDefaultRetentionCardDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>

      <Card className="instance-settings-card">
        <Link to="/instance/groups" className="instance-settings-card-link">
          <Users />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.groupManagement")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.groupManagementDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>

      <Card className="instance-settings-card">
        <Link to="/instance/companies" className="instance-settings-card-link">
          <Building2 />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.companyManagement")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.companyManagementDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>

      <Card className="instance-settings-card">
        <Link to="/instance/archive-company" className="instance-settings-card-link">
          <Archive />
          <CardContent className="instance-settings-card-body">
            <div className="instance-settings-card-label">{t("instance.archiveCompanySettings")}</div>
            <p className="instance-settings-card-desc">
              {t("instance.archiveCompanySettingsDesc")}
            </p>
          </CardContent>
        </Link>
      </Card>
    </div>
  );
}
