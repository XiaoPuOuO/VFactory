import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./DefaultCompanyPathSettings.css";

/**
 * 此站設定 > 預設公司路徑
 * 設定 default_company_path：非管理員建立的公司無法自訂 path，其 Agent 設定資料夾自動放在此路徑下 (companyId)。
 */
export function DefaultCompanyPathSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [pathValue, setPathValue] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.instanceSettings.defaultCompanyPath,
    queryFn: () => instanceSettingsApi.getDefaultCompanyPath(),
  });

  useEffect(() => {
    if (data?.defaultCompanyPath != null) {
      setPathValue(data.defaultCompanyPath);
    }
  }, [data?.defaultCompanyPath]);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.defaultCompanyPath") },
    ]);
  }, [setBreadcrumbs, t]);

  const saveMutation = useMutation({
    mutationFn: (value: string) => instanceSettingsApi.setDefaultCompanyPath(value),
    onSuccess: (_, submitted) => {
      setPathValue(submitted);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(pathValue.trim());
  };

  const currentStored = data?.defaultCompanyPath ?? "";
  const isDirty = pathValue.trim() !== currentStored;

  return (
    <div className="default-company-path-page">
      <div className="default-company-path-header">
        <div className="default-company-path-title-row">
          <FolderOpen />
          <h1 className="default-company-path-title">{t("instance.defaultCompanyPath")}</h1>
        </div>
        <p className="default-company-path-desc">{t("instance.defaultCompanyPathDesc")}</p>
      </div>

      <Card className="default-company-path-card">
        <CardContent>
          <form onSubmit={handleSubmit} className="default-company-path-form">
            <Label htmlFor="default-company-path-input" className="label">
              {t("instance.defaultCompanyPath")}
            </Label>
            <Input
              id="default-company-path-input"
              type="text"
              className="input"
              value={pathValue}
              onChange={(e) => setPathValue(e.target.value)}
              placeholder="/var/paperclip/companies"
              disabled={isLoading}
            />
            <div className="default-company-path-actions">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !isDirty}
              >
                {saveMutation.isPending ? "…" : t("common.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
