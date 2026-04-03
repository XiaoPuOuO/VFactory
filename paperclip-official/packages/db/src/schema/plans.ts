import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * 方案配額：與 company 覆寫欄位語意一致；null 表示不限制。
 * tokenLimit／priceLimitCents：團隊用量與花費護欄（BYOK 下仍適用）。
 * 其餘鍵為平台配額示意，供 UI／未來 meter 使用；未強制前僅展示。
 */
export type PlanEntitlements = {
  tokenLimit?: number | null;
  priceLimitCents?: number | null;
  tierKey?: string | null;
  billableRunsPerMonth?: number | null;
  editorSeatsIncluded?: number | null;
  concurrentRuns?: number | null;
  webhookDeliveriesPerMonth?: number | null;
};

/** 各金流／外部目錄 ID（stripe price、綠界品項等）。 */
export type PlanExternalRefs = Record<string, string>;

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** tokenLimit / priceLimitCents；null 欄位表示繼承「不限制」。 */
    entitlements: jsonb("entitlements").$type<PlanEntitlements>().notNull().default({}),
    externalRefs: jsonb("external_refs").$type<PlanExternalRefs>().notNull().default({}),
    /** 訂閱／續期週期天數（綠界單筆成功後延長；Stripe 由 Price 決定）。 */
    intervalDays: integer("interval_days").notNull().default(30),
    /**
     * 在一般定價／帳單列表是否對「符合條件的公司」顯示。
     * 若 allowedCompanyIds 非空，僅該等公司可見／可訂閱（此欄僅影響「無名單時」是否全站公開）。
     */
    catalogVisible: boolean("catalog_visible").notNull().default(true),
    /** 非空時僅列出的 company id 可在帳單頁看到並結帳此方案（企業定製、內部方案）。 */
    allowedCompanyIds: jsonb("allowed_company_ids").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex("plans_slug_unique_idx").on(table.slug),
  }),
);
