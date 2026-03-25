import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { instanceGroups } from "./instance_groups.js";

/**
 * 群組繼承：group_id 繼承 parent_group_id 的權限（可多對多）。
 * 有效權限 = 本組權限 ∪ 所有祖先組權限（* 表示全部）。
 */
export const instanceGroupInheritance = pgTable(
  "instance_group_inheritance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => instanceGroups.id, { onDelete: "cascade" }),
    parentGroupId: uuid("parent_group_id")
      .notNull()
      .references(() => instanceGroups.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    groupParentUniqueIdx: uniqueIndex("instance_group_inheritance_group_parent_unique_idx").on(
      table.groupId,
      table.parentGroupId,
    ),
    groupIdx: index("instance_group_inheritance_group_idx").on(table.groupId),
    parentIdx: index("instance_group_inheritance_parent_idx").on(table.parentGroupId),
  }),
);
