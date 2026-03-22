import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { INTEGRATION_TOKEN_SCOPES, type IntegrationTokenScope } from "@paperclipai/shared";
import { integrationTokensApi } from "../api/integrationTokens";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ApiError } from "../api/client";
import { Trash2 } from "lucide-react";

export function CompanyIntegrationTokensSection({ companyId }: { companyId: string }) {
  const { t } = useTranslation("company");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<IntegrationTokenScope[]>(["costs:read"]);
  const [tokenFlash, setTokenFlash] = useState<string | null>(null);

  const { data: keys, error: listError } = useQuery({
    queryKey: queryKeys.companies.integrationTokens(companyId),
    queryFn: () => integrationTokensApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      integrationTokensApi.create(companyId, {
        name: name.trim() || t("integrationTokensDefaultName"),
        scopes,
      }),
    onSuccess: (created) => {
      setTokenFlash(created.token);
      setName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.integrationTokens(companyId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => integrationTokensApi.remove(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.integrationTokens(companyId) });
    },
  });

  const toggleScope = (s: IntegrationTokenScope) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const listErr = listError instanceof ApiError && listError.status === 403;

  return (
    <div className="company-settings-block">
      <p className="company-settings-invite-desc">{t("integrationTokensIntro")}</p>
      {listErr && (
        <p className="company-settings-invite-error">{t("integrationTokensPermissionDenied")}</p>
      )}
      {!listErr && keys && (
        <>
          <ul className="company-webhooks-list">
            {keys.map((k) => (
              <li key={k.id} className="company-webhooks-row">
                <div className="company-webhooks-row-main">
                  <span className="company-webhooks-name">{k.name}</span>
                  <span className="company-webhooks-events-inline">{k.scopes.join(", ")}</span>
                  {k.revokedAt && (
                    <span className="company-webhooks-disabled">{t("integrationTokensRevoked")}</span>
                  )}
                </div>
                {!k.revokedAt && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("integrationTokensRevoke")}
                    onClick={() => deleteMutation.mutate(k.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {keys.length === 0 && (
            <p className="company-settings-invite-desc">{t("integrationTokensEmpty")}</p>
          )}
        </>
      )}

      {!listErr && (
        <div className="company-webhooks-form">
          <label className="company-settings-field-label">{t("integrationTokensName")}</label>
          <input
            className="company-settings-input"
            name="integration-token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("integrationTokensNamePlaceholder")}
          />
          <div className="company-settings-invite-desc" style={{ marginTop: "0.75rem" }}>
            {t("integrationTokensScopes")}
          </div>
          <div className="integration-token-scope-grid">
            {INTEGRATION_TOKEN_SCOPES.map((s) => (
              <label key={s} className="integration-token-scope-item">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => toggleScope(s)}
                />
                <span className="mono">{s}</span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || scopes.length === 0}
          >
            {createMutation.isPending ? t("integrationTokensCreating") : t("integrationTokensCreate")}
          </Button>
          {createMutation.isError && (
            <p className="company-settings-invite-error">{t("integrationTokensCreateFailed")}</p>
          )}
          {tokenFlash && (
            <div className="company-settings-snippet-box" style={{ marginTop: "1rem" }}>
              <div className="company-settings-snippet-title">{t("integrationTokensSecretOnce")}</div>
              <textarea className="company-settings-snippet-textarea" readOnly value={tokenFlash} rows={2} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(tokenFlash);
                }}
              >
                {t("integrationTokensCopy")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
