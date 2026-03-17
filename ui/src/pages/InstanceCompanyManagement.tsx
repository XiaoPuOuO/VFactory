import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Archive } from "lucide-react";
import { Link } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "./InstanceCompanyManagement.css";

/**
 * 此站設定 > Company 管理
 * 列出所有公司，提供進入公司與前往封存設定的入口。
 */
export function InstanceCompanyManagement() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { companies, loading, error } = useCompany();

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
    enabled: companies.length > 0,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.companyManagement") },
    ]);
  }, [setBreadcrumbs, t]);

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
        <Link
          to="/instance/archive-company"
          className="instance-company-management-archive-link"
        >
          <Archive />
          {t("instance.archiveCompanySettings")}
        </Link>
      </div>

      {companies.length === 0 ? (
        <EmptyState
          icon={Building2}
          message={t("instance.noCompaniesYet")}
        />
      ) : (
        <Card>
          <CardContent className="instance-company-management-card-content">
            <table className="instance-company-management-table">
              <thead>
                <tr>
                  <th className="instance-company-management-th-name">{t("instance.companyName")}</th>
                  <th className="instance-company-management-th-desc">{t("instance.companyDescription")}</th>
                  <th className="instance-company-management-th-status">{t("instance.companyStatus")}</th>
                  <th className="instance-company-management-th-prefix">{t("instance.issuePrefix")}</th>
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
                  const statusClass =
                    company.status === "active"
                      ? "active"
                      : company.status === "paused"
                        ? "paused"
                        : "archived";
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
                      <td className="instance-company-management-td-agents">{agentCount}</td>
                      <td className="instance-company-management-td-issues">{issueCount}</td>
                      <td className="instance-company-management-td-actions">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/${encodeURIComponent(company.issuePrefix)}/dashboard`}>
                            <ExternalLink className="instance-company-management-action-icon" />
                            {t("instance.enterCompany")}
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
