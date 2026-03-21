import { pgTable, uuid, text, timestamp, integer, bigint, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/** 預算／Token／Price 上限觸發紀錄，供 Costs 頁面歷史查詢與 dashboard 回傳。 */
export const limitBreachEvents = pgTable(
  "limit_breach_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    /** budget_breach | token_limit_breach | price_limit_breach | budget_policy_breach */
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** 觸發時的金額（分）或 token 使用量等，依 type 解讀。 */
    amountCents: integer("amount_cents"),
    tokenUsage: bigint("token_usage", { mode: "number" }),
    /** 關聯的 agent（budget_breach 時為被暫停的 agent）。 */
    agentId: uuid("agent_id").references(() => agents.id),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyOccurredIdx: index("limit_breach_events_company_occurred_idx").on(
      table.companyId,
      table.occurredAt,
    ),
  }),
);
