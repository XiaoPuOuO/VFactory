import { useTranslation } from "react-i18next";
import { User, LogOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authApi } from "../api/auth";
import { meApi } from "../api/me";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { queryKeys } from "../lib/queryKeys";
import "./Account.css";

export function Account() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [signingOut, setSigningOut] = useState(false);
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi.get(),
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("account.title") }]);
  }, [setBreadcrumbs, t]);

  if (isLoading) {
    return (
      <div className="account-page">
        <div className="account-header">
          <div className="account-title-row">
            <User />
            <h1 className="account-title">{t("account.title")}</h1>
          </div>
        </div>
        <Card className="account-card">
          <CardContent className="account-card-body">
            <p className="account-muted">{t("common.loading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="account-page">
        <div className="account-header">
          <div className="account-title-row">
            <User />
            <h1 className="account-title">{t("account.title")}</h1>
          </div>
        </div>
        <Card className="account-card">
          <CardContent className="account-card-body">
            <p className="account-muted">{t("account.loadError")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateDeveloperMode = useMutation({
    mutationFn: (next: boolean) => meApi.updateDeveloperMode(next),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const devMode = Boolean(profile.developerMode);

  return (
    <div className="account-page">
      <div className="account-header">
        <div className="account-title-row">
          <User />
          <h1 className="account-title">{t("account.title")}</h1>
        </div>
        <p className="account-desc">{t("account.description")}</p>
      </div>

      <Card className="account-card">
        <CardContent className="account-card-body">
          <div className="account-profile">
            {profile.image ? (
              <img
                src={profile.image}
                alt=""
                className="account-avatar"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="account-avatar account-avatar-fallback" aria-hidden>
                <User />
              </div>
            )}
            <div className="account-fields">
              <div className="account-field">
                <span className="account-field-label">{t("account.name")}</span>
                <span className="account-field-value">{profile.name}</span>
              </div>
              {profile.email != null && profile.email !== "" && (
                <div className="account-field">
                  <span className="account-field-label">{t("account.email")}</span>
                  <span className="account-field-value">{profile.email}</span>
                </div>
              )}
              {profile.group != null && profile.group !== "" && (
                <div className="account-field">
                  <span className="account-field-label">{t("account.group")}</span>
                  <span className="account-field-value">{profile.group}</span>
                </div>
              )}
              {profile.createdAt && (
                <div className="account-field">
                  <span className="account-field-label">{t("account.registeredAt")}</span>
                  <span className="account-field-value">
                    {formatRelativeTime(t, profile.createdAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="account-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await authApi.signOut();
                  await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
                  navigate("/landing", { replace: true });
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <LogOut className="account-action-icon" aria-hidden />
              {signingOut ? t("account.signingOut") : t("account.signOut")}
            </Button>
          </div>
          <div className="account-devmode">
            <div className="account-field">
              <span className="account-field-label">{t("account.developerMode")}</span>
              <span className="account-field-value">
                <label className="account-devmode-toggle">
                  <input
                    type="checkbox"
                    checked={devMode}
                    onChange={(e) => {
                      const next = e.target.checked;
                      updateDeveloperMode.mutate(next);
                    }}
                    disabled={updateDeveloperMode.isPending}
                  />
                  <span className="account-devmode-label">
                    {t("account.developerModeDesc")}
                  </span>
                </label>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
