import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Trash2, Eraser } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "./ArchiveCompanySettings.css";

/**
 * 此站設定 > 封存公司設定
 * 列出所有公司，提供徹底刪除（remove）公司及其相關資料的功能。
 * 僅供具備 board 權限之操作者使用。
 */
export function ArchiveCompanySettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const { companies, loading, error } = useCompany();
  const queryClient = useQueryClient();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.archiveCompanySettings") },
    ]);
  }, [setBreadcrumbs, t]);

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

  if (loading) {
    return (
      <div className="archive-settings-loading">
        {t("instance.loadingCompanies")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="archive-settings-error">
        {error instanceof Error ? error.message : t("instance.failedLoadCompanies")}
      </div>
    );
  }

  const runCleanupOrphans = () => {
    if (!window.confirm(t("instance.cleanupOrphansConfirm"))) return;
    cleanupOrphansMutation.mutate();
  };

  return (
    <div className="archive-settings-page">
      <div className="archive-settings-header">
        <div className="archive-settings-title-row">
          <div className="archive-settings-title-wrap">
            <Archive />
            <h1 className="archive-settings-title">{t("instance.archiveCompanySettings")}</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="archive-settings-cleanup-btn"
            disabled={cleanupOrphansMutation.isPending}
            onClick={runCleanupOrphans}
            title={t("instance.cleanupOrphansTooltip")}
          >
            <Eraser />
            {cleanupOrphansMutation.isPending ? t("common.loading") : t("instance.cleanupOrphans")}
          </Button>
        </div>
        <p className="archive-settings-desc">
          {t("instance.archiveCompanySettingsDesc")}
        </p>
      </div>

      {actionError && (
        <div className="archive-settings-action-banner">
          {actionError}
        </div>
      )}

      {companies.length === 0 ? (
        <EmptyState
          icon={Archive}
          message={t("instance.noCompaniesToArchive")}
        />
      ) : (
        <div className="archive-settings-list">
          {companies.map((company) => {
            const isConfirmingRemove = confirmRemoveId === company.id;
            const isArchived = company.status === "archived";
            const canDeletePermanently = isArchived;
            const statusClass =
              company.status === "active"
                ? "active"
                : company.status === "paused"
                  ? "paused"
                  : "archived";

            return (
              <Card key={company.id}>
                <CardContent className="archive-settings-card-content">
                  <div className="archive-settings-card-inner">
                    <div className="archive-settings-card-body">
                      <h3 className="archive-settings-card-name">{company.name}</h3>
                      {company.description && (
                        <p className="archive-settings-card-desc">
                          {company.description}
                        </p>
                      )}
                      <span className={`archive-settings-status-badge ${statusClass}`}>
                        {company.status}
                      </span>
                      {!isArchived && (
                        <p className="archive-settings-hint">
                          {t("instance.mustArchiveBeforeDelete")}
                        </p>
                      )}
                    </div>

                    <div className="archive-settings-actions">
                      {!isArchived && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={archiveMutation.isPending}
                          onClick={() => archiveMutation.mutate(company.id)}
                        >
                          <Archive />
                          {t("instance.archiveCompany")}
                        </Button>
                      )}
                      {canDeletePermanently &&
                        (!isConfirmingRemove ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setConfirmRemoveId(company.id)}
                          >
                            <Trash2 />
                            {t("instance.deleteCompanyPermanently")}
                          </Button>
                        ) : (
                          <div className="archive-settings-confirm-box">
                            <span className="archive-settings-confirm-text">
                              {t("instance.confirmDeleteCompany")}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmRemoveId(null)}
                              disabled={removeMutation.isPending}
                            >
                              {t("common.cancel")}
                            </Button>
                            <Button
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
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
