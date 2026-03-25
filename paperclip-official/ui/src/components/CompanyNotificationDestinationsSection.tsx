import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  COMPANY_WEBHOOK_EVENT_TYPES,
  type CompanyWebhookEventType,
  type NotificationChannelType,
} from "@paperclipai/shared";
import { companyNotificationDestinationsApi } from "../api/companyNotificationDestinations";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ApiError } from "../api/client";
import { Trash2 } from "lucide-react";

export function CompanyNotificationDestinationsSection({ companyId }: { companyId: string }) {
  const { t } = useTranslation("company");
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<NotificationChannelType>("slack");
  const [name, setName] = useState("");
  const [events, setEvents] = useState<CompanyWebhookEventType[]>(["issue.comment_created"]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [broadcastToEmails, setBroadcastToEmails] = useState("");

  const { data: destinations, error: listError } = useQuery({
    queryKey: queryKeys.companies.notificationDestinations(companyId),
    queryFn: () => companyNotificationDestinationsApi.list(companyId),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (channel === "email") {
        const port = parseInt(smtpPort, 10);
        if (!Number.isFinite(port)) throw new Error("Invalid SMTP port");
        return companyNotificationDestinationsApi.create(companyId, {
          channel: "email",
          name: name.trim() || undefined,
          eventSubscriptions: events,
          config: {
            smtpHost: smtpHost.trim(),
            smtpPort: port,
            smtpSecure: port === 465,
            smtpUser: smtpUser.trim(),
            smtpPassword: smtpPassword,
            fromAddress: fromAddress.trim(),
            broadcastToEmails:
              broadcastToEmails.trim().length > 0
                ? broadcastToEmails
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : undefined,
          },
        });
      }
      return companyNotificationDestinationsApi.create(companyId, {
        channel,
        name: name.trim() || undefined,
        eventSubscriptions: events,
        config: { webhookUrl: webhookUrl.trim() },
      });
    },
    onSuccess: () => {
      setName("");
      setWebhookUrl("");
      setSmtpHost("");
      setSmtpPassword("");
      setFromAddress("");
      setBroadcastToEmails("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.notificationDestinations(companyId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companyNotificationDestinationsApi.remove(companyId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companies.notificationDestinations(companyId) });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => companyNotificationDestinationsApi.test(companyId, id),
  });

  const toggleEvent = (ev: CompanyWebhookEventType) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const listErr = listError instanceof ApiError && listError.status === 403;

  return (
    <div className="company-settings-block">
      <p className="company-settings-invite-desc">{t("notificationDestinationsIntro")}</p>
      {listErr && (
        <p className="company-settings-invite-error">{t("notificationDestinationsPermissionDenied")}</p>
      )}
      {!listErr && destinations && (
        <>
          <ul className="company-webhooks-list">
            {destinations.map((d) => (
              <li key={d.id} className="company-webhooks-row">
                <div className="company-webhooks-row-main">
                  <span className="company-webhooks-name">
                    {d.name} ({d.channel})
                  </span>
                  <span className="company-webhooks-events-inline">{d.eventSubscriptions.join(", ")}</span>
                  {!d.enabled && (
                    <span className="company-webhooks-disabled">{t("webhooksDisabled")}</span>
                  )}
                </div>
                <div className="company-webhooks-row-actions">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => testMutation.mutate(d.id)}
                    disabled={testMutation.isPending}
                  >
                    {t("notificationDestinationsTest")}
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("notificationDestinationsDelete")}
                    onClick={() => deleteMutation.mutate(d.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {destinations.length === 0 && (
            <p className="company-settings-invite-desc">{t("notificationDestinationsEmpty")}</p>
          )}
        </>
      )}

      {!listErr && (
        <div className="company-webhooks-form">
          <label className="company-webhooks-field">
            <span className="company-settings-field-label">{t("notificationDestinationsChannel")}</span>
            <select
              className="company-settings-input"
              value={channel}
              onChange={(e) => setChannel(e.target.value as NotificationChannelType)}
            >
              <option value="email">Email (SMTP)</option>
              <option value="slack">Slack Incoming Webhook</option>
              <option value="discord">Discord Webhook</option>
            </select>
          </label>
          <NdField name="nd-name" label={t("webhooksNameOptional")} value={name} onChange={setName} />
          {channel === "email" ? (
            <>
              <NdField name="smtp-host" label="SMTP host" value={smtpHost} onChange={setSmtpHost} />
              <NdField name="smtp-port" label="SMTP port" value={smtpPort} onChange={setSmtpPort} />
              <NdField name="smtp-user" label="SMTP user" value={smtpUser} onChange={setSmtpUser} />
              <NdField
                name="smtp-pass"
                label="SMTP password"
                value={smtpPassword}
                onChange={setSmtpPassword}
                password
              />
              <NdField name="from" label="From address" value={fromAddress} onChange={setFromAddress} />
              <NdField
                name="broadcast"
                label={t("notificationDestinationsBroadcastEmails")}
                value={broadcastToEmails}
                onChange={setBroadcastToEmails}
                placeholder="a@x.com, b@y.com"
              />
            </>
          ) : (
            <NdField
              name="wh-url"
              label={t("notificationDestinationsWebhookUrl")}
              value={webhookUrl}
              onChange={setWebhookUrl}
              placeholder="https://…"
            />
          )}
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
                  <span>{ev}</span>
                </label>
              ))}
            </div>
          </div>
          {createMutation.isError && (
            <p className="company-settings-invite-error">
              {createMutation.error instanceof Error ? createMutation.error.message : t("notificationDestinationsCreateFailed")}
            </p>
          )}
          {testMutation.isError && (
            <p className="company-settings-invite-error">
              {testMutation.error instanceof ApiError ? testMutation.error.message : "Test failed"}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || events.length === 0}
          >
            {createMutation.isPending ? t("notificationDestinationsCreating") : t("notificationDestinationsAdd")}
          </Button>
        </div>
      )}
    </div>
  );
}

function NdField({
  label,
  name,
  value,
  onChange,
  placeholder,
  password,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  password?: boolean;
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
        type={password ? "password" : "text"}
        autoComplete={password ? "new-password" : undefined}
      />
    </label>
  );
}
