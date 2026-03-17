import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { instanceGroups } from "./instance_groups.js";

/**
 * 身分組擁有的權限。permission_key = '*' 表示該組擁有所有權限。
 */
export const instanceGroupPermissions = pgTable(
  "instance_group_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => instanceGroups.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    groupPermissionUniqueIdx: uniqueIndex("instance_group_permissions_group_key_unique_idx").on(
      table.groupId,
      table.permissionKey,
    ),
    groupIdx: index("instance_group_permissions_group_idx").on(table.groupId),
  }),
);
