import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { chatRooms } from "./chat_rooms.js";

/**
 * Agent 跨聊天記憶：以 agent 隔離，不同 agent UUID 之間不互通。
 * 存該 agent 的跨聊天事實／摘要，一筆一筆寫入；讀取時取該 agent 最近 K 筆。
 */
export const agentChatMemories = pgTable(
  "agent_chat_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceRoomId: uuid("source_room_id").references(() => chatRooms.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentCreatedIdx: index("agent_chat_memories_company_agent_created_idx").on(
      table.companyId,
      table.agentId,
      table.createdAt,
    ),
  }),
);
