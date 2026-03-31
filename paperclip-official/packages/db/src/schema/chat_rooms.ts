import { pgTable, uuid, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    type: text("type").notNull(), // 'direct' | 'group'
    name: text("name"), // nullable; group display name
    /** Board 在「針對專案」選取的預設專案；刪除專案時設為 null。 */
    composerProjectId: uuid("composer_project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    /**
     * 透過「快速新增對話」建立的 direct session：使用者送出第一則 Board 訊息後，
     * 以輕量方式（HTTP adapter 或 OpenAI）產生房間顯示名稱，完成後清除為 false。
     */
    awaitingSessionTitle: boolean("awaiting_session_title").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("chat_rooms_company_idx").on(table.companyId),
  }),
);
