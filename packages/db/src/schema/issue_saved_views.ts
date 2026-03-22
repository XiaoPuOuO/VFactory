import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * 使用者於某公司的 Issues 列表「具名篩選視圖」（與 UI 的 viewStateKey / scope 對應）。
 * 僅 board 使用者透過 API 存取；user_id 對應 auth user id。
 */
export const issueSavedViews = pgTable(
  "issue_saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    scopeKey: text("scope_key").notNull(),
    name: text("name").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUserScopeNameUq: uniqueIndex("issue_saved_views_company_user_scope_name_uq").on(
      table.companyId,
      table.userId,
      table.scopeKey,
      table.name,
    ),
    listIdx: index("issue_saved_views_company_user_scope_idx").on(table.companyId, table.userId, table.scopeKey),
  }),
);
