import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/** 租戶內角色：owner 租戶擁有者、admin 管理員、member 成員 */
export const tenantMembershipRoleEnum = ["owner", "admin", "member"] as const;

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    /** auth user id (user table id) */
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserUniqueIdx: uniqueIndex("tenant_memberships_tenant_user_unique_idx").on(table.tenantId, table.userId),
    tenantIdx: index("tenant_memberships_tenant_idx").on(table.tenantId),
    userIdx: index("tenant_memberships_user_idx").on(table.userId),
  }),
);
