import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySubscriptions } from "./company_subscriptions.js";

export const billingInvoiceAttempts = pgTable(
  "billing_invoice_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => companySubscriptions.id, {
      onDelete: "set null",
    }),
    invoiceProvider: text("invoice_provider").notNull(),
    status: text("status").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("billing_invoice_attempts_company_idx").on(table.companyId),
  }),
);
