import { pgTable, uuid, text, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { pgEnum } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/** 排程類型：cron 重複、單次指定時刻、多段日期區間內每日 */
export const scheduleKindEnum = pgEnum("schedule_kind", ["cron", "once", "ranges"]);

export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    name: text("name").notNull(),
    scheduleKind: scheduleKindEnum("schedule_kind").notNull(),
    timezone: text("timezone").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    /** cron：標準 5 欄表達式；once / ranges 為 null */
    cronExpression: text("cron_expression"),
    /** once：單次執行時刻；cron / ranges 為 null */
    runAt: timestamp("run_at", { withTimezone: true }),
    /** ranges：每日觸發時間 "HH:mm"；cron / once 為 null */
    timeOfDay: text("time_of_day"),
    /** ranges：[{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }, ...]；cron / once 為 null */
    windows: jsonb("windows").$type<Array<{ start: string; end: string }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEnabledNextRunIdx: index("agent_schedules_company_enabled_next_run_idx").on(
      table.companyId,
      table.enabled,
      table.nextRunAt,
    ),
    agentIdx: index("agent_schedules_agent_idx").on(table.agentId),
  }),
);
