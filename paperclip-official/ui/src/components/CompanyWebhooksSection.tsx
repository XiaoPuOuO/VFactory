import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COMPANY_WEBHOOK_EVENT_TYPES, type CompanyWebhookEventType } from "@paperclipai/shared";
import { companyWebhooksApi } from "../api/companyWebhooks";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ApiError } from "../api/client";
import { Trash2 } from "lucide-react";

export function CompanyWebhooksSection({ companyId }: { companyId: string }) {
  const { t } = useTranslation("company");
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [events, setEvents] = useState<CompanyWebhookEventType[]>(["issue.updated"]);
  const [secretFlash, setSecretFlash] = useState<string | null>(null);

  const { data: endpoints, error: listError } = useQuery({
    queryKey: queryKeys.companies.webhooks(companyId),
    queryFn: () => companyWebhooksApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      companyWebhooksApi.create(companyId, {
        url: url.trim(),
        name: name.trim() || undefined,
        eventSubscriptions: events,
      }),
    onSuccess: (created) => {
      setSecretFlash(created.signingSecret);
      setUrl("");
      setName("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.webhooks(companyId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companyWebhooksApi.remove(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.webhooks(companyId) });
    },
  });

  const toggleEvent = (ev: CompanyWebhookEventType) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const listErr = listError instanceof ApiError && listError.status === 403;

  return (
    <div className="company-settings-block">
      <p className="company-settings-invite-desc">{t("webhooksIntro")}</p>
      {listErr && (
        <p className="company-settings-invite-error">{t("webhooksPermissionDenied")}</p>
      )}
      {!listErr && endpoints && (
        <>
          <ul className="company-webhooks-list">
            {endpoints.map((ep) => (
              <li key={ep.id} className="company-webhooks-row">
                <div className="company-webhooks-row-main">
                  <span className="company-webhooks-name">{ep.name}</span>
                  <span className="company-webhooks-url mono">{ep.url}</span>
                  <span className="company-webhooks-events-inline">
                    {ep.eventSubscriptions.join(", ")}
                  </span>
                  {!ep.enabled && (
                    <span className="company-webhooks-disabled">{t("webhooksDisabled")}</span>
                  )}
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t("webhooksDelete")}
                  onClick={() => deleteMutation.mutate(ep.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          {endpoints.length === 0 && (
            <p className="company-settings-invite-desc">{t("webhooksEmpty")}</p>
          )}
        </>
      )}

      {!listErr && (
        <div className="company-webhooks-form">
          <Field
            label={t("webhooksUrl")}
            name="webhook-url"
            value={url}
            onChange={setUrl}
            placeholder="https://…"
          />
          <Field
            label={t("webhooksNameOptional")}
            name="webhook-name"
            value={name}
            onChange={setName}
            placeholder={t("webhooksNamePlaceholder")}
          />
          <div className="company-webhooks-events">
            <span className="company-settings-field-label">{t("webhooksEvents")}</span>
            <div className="company-webhooks-checkboxes">
              {COMPANY_WEBHOOK_EVENT_TYPES.map((ev) => (
                <label key={ev} className="company-webhooks-check">
                  <input
                    type="checkbox"
                    checked={events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                  />
                  <span className="mono">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          {createMutation.isError && (
            <p className="company-settings-invite-error">
              {createMutation.error instanceof ApiError && createMutation.error.status === 403
                ? t("webhooksPermissionDenied")
                : createMutation.error instanceof Error
                  ? createMutation.error.message
                  : t("webhooksCreateFailed")}
            </p>
          )}
          {secretFlash && (
            <div className="company-webhooks-secret-box">
              <p className="company-settings-invite-desc">{t("webhooksSecretOnce")}</p>
              <textarea className="company-settings-snippet-textarea" readOnly value={secretFlash} rows={2} />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(secretFlash);
                }}
              >
                {t("webhooksCopySecret")}
              </Button>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !url.trim() || events.length === 0}
          >
            {createMutation.isPending ? t("webhooksCreating") : t("webhooksAdd")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="company-webhooks-field">
      <span className="company-settings-field-label">{label}</span>
      <input
        name={name}
        className="company-settings-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
