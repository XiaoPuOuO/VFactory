import {
  bigint,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    issuePrefix: text("issue_prefix").notNull().default("PAP"),
    issueCounter: integer("issue_counter").notNull().default(0),
    budgetMonthlyCents: integer("budget_monthly_cents").notNull().default(0),
    spentMonthlyCents: integer("spent_monthly_cents").notNull().default(0),
    /** 公司層級 Token 上限（當月累計 input+output tokens）；null 表示不限制。 */
    tokenLimit: bigint("token_limit", { mode: "number" }),
    /** 公司層級花費上限（當月累計，單位：分）；null 表示不限制。 */
    priceLimitCents: integer("price_limit_cents"),
    requireBoardApprovalForNewAgents: boolean("require_board_approval_for_new_agents")
      .notNull()
      .default(true),
    brandColor: text("brand_color"),
    /** 公司圖示 asset id（FK 於 migration 設定）；若設定則外觀區塊顯示上傳圖，否則顯示品牌色 pattern。 */
    iconAssetId: uuid("icon_asset_id"),
    /**
     * 合規資料留存目標天數（activity／approval／cost 等）；null 表示繼承實例預設。
     * 目前僅作政策記錄與 UI 顯示，不自動刪除資料庫列。
     */
    complianceDataRetentionDays: integer("compliance_data_retention_days"),
    workingDirectory: text("working_directory"),
    /** 全域暫停新喚醒／排程觸發直到此時間（UTC）；null 表示未處於急停。 */
    wakeupsPausedUntil: timestamp("wakeups_paused_until", { withTimezone: true }),
    wakeupsPausedReason: text("wakeups_paused_reason"),
    /** 預排維護區間：元素為 UTC ISO8601 的 start／end，含端點。 */
    maintenanceWindows: jsonb("maintenance_windows").$type<Array<{ start: string; end: string }> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** 同一租戶內 issue_prefix 不重複；不同租戶可重複 */
    tenantIssuePrefixUniqueIdx: uniqueIndex("companies_tenant_issue_prefix_idx").on(
      table.tenantId,
      table.issuePrefix,
    ),
  }),
);
