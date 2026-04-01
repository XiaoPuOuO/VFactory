import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const applicationLogEntries = pgTable(
  "application_log_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    level: text("level").notNull(),
    message: text("message").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("application_log_entries_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);
