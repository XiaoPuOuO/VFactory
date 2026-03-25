import { pgTable, uuid, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * 聊天列表偏好：備註與置頂，依公司儲存。
 * entity_id 為 room.id 或 "agent:" + agentId。
 */
export const chatListPreferences = pgTable(
  "chat_list_preferences",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    note: text("note"),
    pinnedOrder: integer("pinned_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chat_list_preferences_company_entity_idx").on(table.companyId, table.entityId),
  ],
);
