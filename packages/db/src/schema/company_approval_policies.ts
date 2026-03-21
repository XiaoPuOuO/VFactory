import { pgTable, uuid, text, boolean, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** 公司層自動核准／委任規則（目前先支援 hire_agent 之預算閾值）。 */
export const companyApprovalPolicies = pgTable(
  "company_approval_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    approvalType: text("approval_type").notNull().default("hire_agent"),
    enabled: boolean("enabled").notNull().default(false),
    /** 允許自動核准之每月預算上限（含）；null 表示未設定閾值（不會自動核准）。 */
    maxBudgetMonthlyCents: integer("max_budget_monthly_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTypeUnique: uniqueIndex("company_approval_policies_company_type_unique_idx").on(
      table.companyId,
      table.approvalType,
    ),
  }),
);
