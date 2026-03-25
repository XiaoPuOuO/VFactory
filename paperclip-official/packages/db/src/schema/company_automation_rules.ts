import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** 公司自動化規則：觸發條件與固定動作以 JSON 儲存，由應用層驗證。 */
export const companyAutomationRules = pgTable(
  "company_automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    trigger: jsonb("trigger").notNull().$type<Record<string, unknown>>(),
    actions: jsonb("actions").notNull().$type<unknown[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_automation_rules_company_idx").on(table.companyId),
    companySortIdx: index("company_automation_rules_company_sort_idx").on(
      table.companyId,
      table.sortOrder,
    ),
  }),
);

/** 規則執行去重：同一 dedupe_key 僅執行一次（依規則生命週期）。 */
export const companyAutomationRuleFires = pgTable(
  "company_automation_rule_fires",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => companyAutomationRules.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ruleDedupeUq: uniqueIndex("company_automation_rule_fires_rule_dedupe_uq").on(
      table.ruleId,
      table.dedupeKey,
    ),
    companyIdx: index("company_automation_rule_fires_company_idx").on(table.companyId),
  }),
);
