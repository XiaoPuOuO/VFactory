import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 此站設定鍵值（例如 default_group：user.group 為 null 時使用的身分組名稱）。
 */
export const instanceSettings = pgTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
