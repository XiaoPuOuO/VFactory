import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const roadmapHumanOverrides = pgTable(
  "roadmap_human_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    patchJson: jsonb("patch_json").notNull().$type<unknown[]>(),
    previewHash: text("preview_hash").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedByUserId: text("applied_by_user_id"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: text("created_by_user_id"),
  },
  (table) => ({
    companyStatusIdx: index("roadmap_human_overrides_company_status_idx").on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
  }),
);
