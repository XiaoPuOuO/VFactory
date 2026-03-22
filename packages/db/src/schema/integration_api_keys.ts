import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { authUsers } from "./auth.js";

/**
 * 非 agent 之公司整合 API token（CI／報表等），與 agent_api_keys 分離。
 * scopes 為 @paperclipai/shared 之 INTEGRATION_TOKEN_SCOPES 子集（JSON 字串陣列）。
 */
export const integrationApiKeys = pgTable(
  "integration_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    /** 允許的範圍（唯讀／有限 API） */
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyHashIdx: index("integration_api_keys_key_hash_idx").on(table.keyHash),
    companyIdx: index("integration_api_keys_company_idx").on(table.companyId),
  }),
);
