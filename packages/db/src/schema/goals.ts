import {
  type AnyPgColumn,
  integer,
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";

export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    description: text("description"),
    level: text("level").notNull().default("task"),
    status: text("status").notNull().default("planned"),
    parentId: uuid("parent_id").references((): AnyPgColumn => goals.id),
    ownerAgentId: uuid("owner_agent_id").references(() => agents.id),
    /** 一次性完成即 achieved；daily/weekly/monthly/custom 為定期刷新，完成後等待 interval 再進入下一週期 */
    recurrence: text("recurrence").notNull().default("one_time"),
    /** 自訂週期：every recurrence_interval_days 天 + _hours 時 + _minutes 分 + _seconds 秒執行一次；四者不可全為 0 */
    recurrenceIntervalDays: integer("recurrence_interval_days").notNull().default(0),
    recurrenceIntervalHours: integer("recurrence_interval_hours").notNull().default(0),
    recurrenceIntervalMinutes: integer("recurrence_interval_minutes").notNull().default(0),
    recurrenceIntervalSeconds: integer("recurrence_interval_seconds").notNull().default(0),
    /** 定期目標：下次刷新時間；now >= 此值時視為進入新週期（有工作） */
    recurrenceNextRefreshAt: timestamp("recurrence_next_refresh_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("goals_company_idx").on(table.companyId),
  }),
);
