import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { chatRooms } from "./chat_rooms.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => chatRooms.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    /** 使用者發送訊息時可指定「針對此專案討論」，供 AI 理解討論範圍；空表示未指定。 */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Agent 透過 API 發送時若帶 X-Paperclip-Run-Id，寫入此欄位；用於 adapter 判斷是否已透過工具回覆，避免 postChatReplyIfNeeded 重複張貼。 */
    authorRunId: text("author_run_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roomCreatedAtIdx: index("chat_messages_room_created_at_idx").on(table.roomId, table.createdAt),
    companyIdx: index("chat_messages_company_idx").on(table.companyId),
  }),
);
