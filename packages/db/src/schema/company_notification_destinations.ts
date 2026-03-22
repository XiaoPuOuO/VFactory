import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * 公司層通知目的地：Email（SMTP）、Slack Incoming Webhook、Discord Webhook。
 * 與 `company_webhook_endpoints`（通用 JSON+HMAC 出站）並存；此表負責通道專屬格式。
 */
export const companyNotificationDestinations = pgTable(
  "company_notification_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    /** email | slack | discord */
    channel: text("channel").notNull(),
    name: text("name").notNull().default("Notification"),
    enabled: boolean("enabled").notNull().default(true),
    eventSubscriptions: jsonb("event_subscriptions").$type<string[]>().notNull().default([]),
    /** 通道設定：SMTP、webhook URL 等（密碼仅存 DB，由具 company:manage 者設定）。 */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_notification_destinations_company_idx").on(table.companyId),
  }),
);
