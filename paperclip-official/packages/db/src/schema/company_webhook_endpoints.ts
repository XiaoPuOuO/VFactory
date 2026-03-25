import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** 出站 Webhook：公司層事件通知（與 agent 喚醒 URL 分離）。 */
export const companyWebhookEndpoints = pgTable(
  "company_webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Webhook"),
    url: text("url").notNull(),
    /** HMAC 簽章用共享密鑰（出站必須可讀取；存取權等同公司敏感設定）。 */
    signingSecret: text("signing_secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** 訂閱的事件型別字串陣列，例如 issue.updated、approval.created */
    eventSubscriptions: jsonb("event_subscriptions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_webhook_endpoints_company_idx").on(table.companyId),
  }),
);
