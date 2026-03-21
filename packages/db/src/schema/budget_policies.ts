import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

/** 多維度預算策略：依專案、billing code 或公司整體，於時間窗內限制花費（分）。 */
export const budgetPolicies = pgTable(
  "budget_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** project | billing_code | company */
    scopeType: text("scope_type").notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    billingCode: text("billing_code"),
    limitCents: integer("limit_cents").notNull(),
    /** 目前僅 calendar_month_utc（與 V1 公司預算週期一致） */
    period: text("period").notNull().default("calendar_month_utc"),
    /** record_only | block_new_runs_for_scope | pause_agents */
    onExceed: text("on_exceed").notNull().default("record_only"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("budget_policies_company_idx").on(table.companyId),
    companyProjectIdx: index("budget_policies_company_project_idx").on(
      table.companyId,
      table.projectId,
    ),
    companyBillingIdx: index("budget_policies_company_billing_idx").on(
      table.companyId,
      table.billingCode,
    ),
    /** 同一公司僅一筆 company 範圍策略 */
    companyScopeUnique: uniqueIndex("budget_policies_company_scope_uq")
      .on(table.companyId)
      .where(sql`${table.scopeType} = 'company'`),
    /** 同一公司同一專案僅一筆 project 範圍策略 */
    projectScopeUnique: uniqueIndex("budget_policies_project_scope_uq")
      .on(table.companyId, table.projectId)
      .where(sql`${table.scopeType} = 'project' AND ${table.projectId} IS NOT NULL`),
    /** 同一公司同一 billing code 僅一筆（大小寫區分） */
    billingScopeUnique: uniqueIndex("budget_policies_billing_scope_uq")
      .on(table.companyId, table.billingCode)
      .where(sql`${table.scopeType} = 'billing_code' AND ${table.billingCode} IS NOT NULL`),
  }),
);
