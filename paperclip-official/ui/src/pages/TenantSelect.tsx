import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "@/lib/router";
import { tenantsApi } from "../api/tenants";
import { setTenantSlug } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { useTranslation } from "react-i18next";

/**
 * 一 User 一 Tenant：API 固定回傳一筆租戶，此頁只負責帶入並導向，不顯示選擇列表。
 */
export function TenantSelectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";

  const { data: tenants = [], isLoading, error } = useQuery({
    queryKey: queryKeys.tenants.me,
    queryFn: () => tenantsApi.listMine(),
    retry: false,
  });

  useEffect(() => {
    if (tenants.length > 0) {
      setTenantSlug(tenants[0].slug);
      navigate(next, { replace: true });
    }
  }, [tenants, next, navigate]);

  if (isLoading) {
    return (
      <div className="app-gate-wrap">
        <div className="app-gate-card">
          <p>{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-gate-wrap">
        <div className="app-gate-card">
          <p className="text-red-600">
            {error instanceof Error ? error.message : t("app.failedToLoadAppState")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-gate-wrap">
      <div className="app-gate-card">
        <p>{t("app.loading")}</p>
      </div>
    </div>
  );
}
