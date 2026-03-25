import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** 租戶狀態：active 正常、suspended 暫停、archived 已封存 */
export const tenantStatusEnum = ["active", "suspended", "archived"] as const;

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL 用識別子，僅允許 [a-z0-9-]+，用於 subdomain 或 path（如 acme.paperclip.app 或 /t/acme） */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("tenants_slug_unique_idx").on(table.slug),
  }),
);
