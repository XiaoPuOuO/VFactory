import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { instanceGroups } from "./instance_groups.js";

/**
 * 使用者與身分組的關聯。
 */
export const instanceUserGroups = pgTable(
  "instance_user_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => instanceGroups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userGroupUniqueIdx: uniqueIndex("instance_user_groups_user_group_unique_idx").on(
      table.userId,
      table.groupId,
    ),
    userIdx: index("instance_user_groups_user_idx").on(table.userId),
    groupIdx: index("instance_user_groups_group_idx").on(table.groupId),
  }),
);
