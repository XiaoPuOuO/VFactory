import { useTranslation } from "react-i18next";

export function StatusBadge({
  status,
  autoPauseReason,
}: {
  status: string;
  autoPauseReason?: string | null;
}) {
  const { t } = useTranslation("status");
  const label = t(status, { defaultValue: status.replace(/_/g, " ") });
  const reasonLabel =
    autoPauseReason &&
    t(`autoPaused.${autoPauseReason}`, { defaultValue: autoPauseReason.replace(/_/g, " ") });
  return (
    <span className="ui-status-badge-wrap">
      <span className="ui-status-badge" data-status={status}>
        {label}
      </span>
      {reasonLabel && (
        <span className="ui-status-badge ui-status-badge--reason" data-status="paused">
          {reasonLabel}
        </span>
      )}
    </span>
  );
}
