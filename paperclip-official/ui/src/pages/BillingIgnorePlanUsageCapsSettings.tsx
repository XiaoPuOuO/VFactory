import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import "./BillingIgnorePlanUsageCapsSettings.css";

/**
 * 此站設定：啟用後合併有效上限時不再套用方案 JSON 中的 token／花費配額；公司覆寫仍生效。
 */
export function BillingIgnorePlanUsageCapsSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.instanceSettings.billingIgnorePlanUsageCaps,
    queryFn: () => instanceSettingsApi.getBillingIgnorePlanUsageCaps(),
  });

  useEffect(() => {
    if (data) {
      setEnabled(Boolean(data.billingIgnorePlanUsageCaps));
    }
  }, [data]);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("instance.instanceSettings") },
      { label: t("instance.billingIgnorePlanUsageCaps") },
    ]);
  }, [setBreadcrumbs, t]);

  const saveMutation = useMutation({
    mutationFn: (value: boolean) => instanceSettingsApi.setBillingIgnorePlanUsageCaps(value),
    onSuccess: (_, submitted) => {
      setEnabled(submitted);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.instanceSettings.billingIgnorePlanUsageCaps,
      });
      void queryClient.invalidateQueries({ queryKey: ["costs"] });
      void queryClient.invalidateQueries({ queryKey: ["agents"] });
      void queryClient.invalidateQueries({ queryKey: ["org"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["sidebar-badges"] });
      pushToast({ title: t("instance.billingIgnorePlanUsageCapsSaved"), tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title:
          err instanceof Error ? err.message : t("instance.billingIgnorePlanUsageCapsSaveFailed"),
        tone: "error",
      });
    },
  });

  const stored = Boolean(data?.billingIgnorePlanUsageCaps);
  const isDirty = enabled !== stored;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(enabled);
  };

  return (
    <div className="billing-ignore-plan-caps-page">
      <div className="billing-ignore-plan-caps-header">
        <div className="billing-ignore-plan-caps-title-row">
          <Gauge />
          <h1 className="billing-ignore-plan-caps-title">{t("instance.billingIgnorePlanUsageCaps")}</h1>
        </div>
        <p className="billing-ignore-plan-caps-desc">{t("instance.billingIgnorePlanUsageCapsDesc")}</p>
      </div>

      <Card className="billing-ignore-plan-caps-card">
        <CardContent>
          <form onSubmit={handleSubmit} className="billing-ignore-plan-caps-form">
            <div className="billing-ignore-plan-caps-row">
              <Checkbox
                id="billing-ignore-plan-caps-checkbox"
                className="billing-ignore-plan-caps-checkbox"
                checked={enabled}
                onCheckedChange={(v) => setEnabled(v === true)}
                disabled={isLoading || saveMutation.isPending}
              />
              <div className="billing-ignore-plan-caps-label-wrap">
                <Label htmlFor="billing-ignore-plan-caps-checkbox" className="label cursor-pointer">
                  {t("instance.billingIgnorePlanUsageCapsToggle")}
                </Label>
                <p className="billing-ignore-plan-caps-hint">{t("instance.billingIgnorePlanUsageCapsHint")}</p>
              </div>
            </div>
            <div className="billing-ignore-plan-caps-actions">
              <Button type="submit" disabled={!isDirty || isLoading || saveMutation.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
