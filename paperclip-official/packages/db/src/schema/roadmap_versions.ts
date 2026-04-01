import { type AnyPgColumn, pgTable, uuid, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const roadmapVersions = pgTable(
  "roadmap_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull().default(""),
    contentMarkdown: text("content_markdown").notNull().default(""),
    createdByUserId: text("created_by_user_id"),
    parentVersionId: uuid("parent_version_id").references((): AnyPgColumn => roadmapVersions.id, {
      onDelete: "set null",
    }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyVersionUnique: uniqueIndex("roadmap_versions_company_version_unique").on(
      table.companyId,
      table.version,
    ),
    companyCreatedIdx: index("roadmap_versions_company_created_idx").on(table.companyId, table.createdAt),
  }),
);
