import type { Db } from "@paperclipai/db";
import { logActivity } from "./activity-log.js";
import { scheduleCompanyNotificationEvent } from "./company-notification-dispatch.js";

/** 寫入 activity 並觸發公司出站 Webhook／通知目的地（budget.limit_breached）。 */
export async function notifyLimitBreach(
  db: Db,
  companyId: string,
  breach: {
    id: string;
    type: string;
    details: Record<string, unknown> | null;
  },
): Promise<void> {
  await logActivity(db, {
    companyId,
    actorType: "system",
    actorId: "budget",
    action: "budget.limit_breached",
    entityType: "limit_breach_event",
    entityId: breach.id,
    details: {
      breachType: breach.type,
      ...(breach.details ?? {}),
    },
  });
  scheduleCompanyNotificationEvent(db, companyId, "budget.limit_breached", {
    breachId: breach.id,
    breachType: breach.type,
    details: breach.details ?? {},
  });
}
