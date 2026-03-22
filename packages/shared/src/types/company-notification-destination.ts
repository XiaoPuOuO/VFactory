import type { CompanyWebhookEventType, NotificationChannelType } from "../constants.js";

/** API 回傳（不含 SMTP 密碼）。 */
export interface CompanyNotificationDestination {
  id: string;
  companyId: string;
  channel: NotificationChannelType;
  name: string;
  enabled: boolean;
  eventSubscriptions: CompanyWebhookEventType[];
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
