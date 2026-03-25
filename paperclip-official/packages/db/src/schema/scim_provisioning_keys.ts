import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * SCIM 2.0 佈建端點用的租戶級 Bearer token（雜湊儲存）。
 */
export const scimProvisioningKeys = pgTable(
  "scim_provisioning_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyHashIdx: index("scim_provisioning_keys_key_hash_idx").on(table.keyHash),
    tenantIdx: index("scim_provisioning_keys_tenant_idx").on(table.tenantId),
  }),
);
