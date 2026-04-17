import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { plans } from "./plans.js";

/** manual：此站管理員於公司管理手動指定方案，不經金流供應商。 */
export const paymentProviderEnum = ["stripe", "ecpay", "manual"] as const;
export type PaymentProviderId = (typeof paymentProviderEnum)[number];

/** 訂閱狀態（供應商無關）。 */
export const subscriptionStatusEnum = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
] as const;

export const companySubscriptions = pgTable(
  "company_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    paymentProvider: text("payment_provider").notNull(),
    status: text("status").notNull().default("incomplete"),
    externalCustomerId: text("external_customer_id"),
    externalSubscriptionId: text("external_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_subscriptions_company_idx").on(table.companyId),
    statusIdx: index("company_subscriptions_status_idx").on(table.status),
  }),
);
