import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * 實例級身分組（group），例如 admin。
 * name = 群組 id（唯一、小寫）；displayName = 顯示給使用者的名稱（可為空）。
 * 權限由 instance_group_permissions 定義，* 表示全部權限；可透過 instance_group_inheritance 繼承他組權限。
 */
export const instanceGroups = pgTable(
  "instance_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex("instance_groups_name_unique_idx").on(table.name),
  }),
);
