import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Webhook 冪等：同一供應商事件 ID 只處理一次。 */
export const billingWebhookEvents = pgTable(
  "billing_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalEventId: text("external_event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerEventUnique: uniqueIndex("billing_webhook_events_provider_event_idx").on(
      table.provider,
      table.externalEventId,
    ),
  }),
);
