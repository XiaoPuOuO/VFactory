import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { chatRooms } from "./chat_rooms.js";

export const chatRoomMembers = pgTable(
  "chat_room_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => chatRooms.id, { onDelete: "cascade" }),
    memberType: text("member_type").notNull(), // 'user' | 'agent'
    memberId: text("member_id").notNull(), // user_id (text) or agent_id (uuid string)
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roomIdx: index("chat_room_members_room_idx").on(table.roomId),
    roomMemberUnique: uniqueIndex("chat_room_members_room_type_member_unique").on(
      table.roomId,
      table.memberType,
      table.memberId,
    ),
  }),
);
