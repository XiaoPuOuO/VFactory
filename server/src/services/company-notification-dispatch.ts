import type { Db } from "@paperclipai/db";
import type { CompanyWebhookEventType } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { scheduleCompanyWebhookEmit } from "./company-webhooks.js";
import { notificationDestinationService } from "./notification-destinations.js";

/**
 * 同時觸發公司出站 Webhook（JSON+HMAC）與 Email／Slack／Discord 目的地。
 * 主交易完成後呼叫；不 await，失敗僅記錄 log。
 */
export function scheduleCompanyNotificationEvent(
  db: Db,
  companyId: string,
  event: CompanyWebhookEventType,
  payload: Record<string, unknown>,
): void {
  scheduleCompanyWebhookEmit(db, companyId, event, payload);
  void notificationDestinationService(db)
    .dispatch(companyId, event, payload)
    .catch((err) => {
      logger.warn({ err, companyId, event }, "notification destinations dispatch failed");
    });
}
