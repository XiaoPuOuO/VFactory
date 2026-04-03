import type { TFunction } from "i18next";
import type { PlanEntitlementsSummary } from "@paperclipai/shared";

interface Props {
  ent: PlanEntitlementsSummary;
  t: TFunction<"billing", undefined>;
}

/** 方案配額列表：平台配額（Token／花費護欄請至成本頁設定）。 */
export function PlanEntitlementsList({ ent, t }: Props) {
  const fmt = (n: number) => n.toLocaleString();
  const hasPlatform =
    ent.billableRunsPerMonth != null ||
    ent.editorSeatsIncluded != null ||
    ent.concurrentRuns != null ||
    ent.webhookDeliveriesPerMonth != null ||
    (ent.tierKey != null && ent.tierKey !== "");

  return (
    <ul className="company-billing-plan-features">
      {ent.tierKey ? (
        <li>
          {t("platformTierKey")}: {ent.tierKey}
        </li>
      ) : null}
      {ent.billableRunsPerMonth != null ? (
        <li>
          {t("platformBillableRuns")}: {fmt(ent.billableRunsPerMonth)}
        </li>
      ) : null}
      {ent.editorSeatsIncluded != null ? (
        <li>
          {t("platformEditorSeats")}: {fmt(ent.editorSeatsIncluded)}
        </li>
      ) : null}
      {ent.concurrentRuns != null ? (
        <li>
          {t("platformConcurrentRuns")}: {fmt(ent.concurrentRuns)}
        </li>
      ) : null}
      {ent.webhookDeliveriesPerMonth != null ? (
        <li>
          {t("platformWebhookDeliveries")}: {fmt(ent.webhookDeliveriesPerMonth)}
        </li>
      ) : null}
      {!hasPlatform ? <li>{t("planEntitlementsEmpty")}</li> : null}
    </ul>
  );
}
