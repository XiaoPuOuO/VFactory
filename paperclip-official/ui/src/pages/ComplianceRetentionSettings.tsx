import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./ComplianceRetentionSettings.css";

/**
 * 此站設定：實例預設合規留存天數（公司未自訂時語意上繼承；不自動刪除資料）。
 */
export function ComplianceRetentionSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [daysValue, setDaysValue] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.instanceSettings.complianceDefaultRetention,
    queryFn: () => instanceSettingsApi.getComplianceDefaultRetention(),
  });

  useEffect(() => {
    if (data?.complianceDefaultRetentionDays != null) {
      setDaysValue(String(data.complianceDefaultRetentionDays));
    } else {
      setDaysValue("");
    }
  }, [data?.complianceDefaultRetentionDays]);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.complianceDefaultRetention") },
    ]);
  }, [setBreadcrumbs, t]);

  const saveMutation = useMutation({
    mutationFn: (value: number | null) =>
      instanceSettingsApi.setComplianceDefaultRetention(value),
    onSuccess: (_, submitted) => {
      setDaysValue(submitted != null ? String(submitted) : "");
      void queryClient.invalidateQueries({
        queryKey: queryKeys.instanceSettings.complianceDefaultRetention,
      });
      pushToast({ title: t("instance.complianceDefaultRetentionSaved"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: err instanceof Error ? err.message : t("instance.complianceDefaultRetentionSaveFailed"),
        tone: "error",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = daysValue.trim();
    if (trimmed === "") {
      saveMutation.mutate(null);
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      pushToast({ title: t("instance.complianceDefaultRetentionInvalid"), tone: "error" });
      return;
    }
    saveMutation.mutate(n);
  };

  const currentStored =
    data?.complianceDefaultRetentionDays != null ? String(data.complianceDefaultRetentionDays) : "";
  const isDirty = daysValue.trim() !== currentStored;

  return (
    <div className="compliance-retention-page">
      <div className="compliance-retention-header">
        <div className="compliance-retention-title-row">
          <Shield />
          <h1 className="compliance-retention-title">{t("instance.complianceDefaultRetention")}</h1>
        </div>
        <p className="compliance-retention-desc">{t("instance.complianceDefaultRetentionDesc")}</p>
      </div>

      <Card className="compliance-retention-card">
        <CardContent>
          <form onSubmit={handleSubmit} className="compliance-retention-form">
            <Label htmlFor="compliance-retention-input" className="label">
              {t("instance.complianceDefaultRetentionDays")}
            </Label>
            <Input
              id="compliance-retention-input"
              type="text"
              inputMode="numeric"
              className="input"
              value={daysValue}
              onChange={(e) => setDaysValue(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="365"
              disabled={isLoading}
              aria-describedby="compliance-retention-hint"
            />
            <p id="compliance-retention-hint" className="compliance-retention-hint">
              {t("instance.complianceDefaultRetentionHint")}
            </p>
            <div className="compliance-retention-actions">
              <Button type="submit" disabled={saveMutation.isPending || !isDirty}>
                {saveMutation.isPending ? "…" : t("common.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
