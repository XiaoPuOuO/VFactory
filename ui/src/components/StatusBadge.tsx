import { useTranslation } from "react-i18next";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("status");
  const label = t(status, { defaultValue: status.replace(/_/g, " ") });
  return (
    <span className="ui-status-badge" data-status={status}>
      {label}
    </span>
  );
}
