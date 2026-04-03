import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, companySubscriptions, plans } from "@paperclipai/db";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface CompanyEffectiveLimits {
  tokenLimit: number | null;
  priceLimitCents: number | null;
  planId: string | null;
  planSlug: string | null;
}

/**
 * 將方案 entitlements 與公司欄位合併：公司欄位非 null 時覆寫方案值。
 * 抽出為純函式以便單元測試，並與 {@link resolveCompanyEffectiveLimits} 共用邏輯。
 */
export function mergePlanEntitlementsWithCompanyOverrides(
  companyTokenLimit: number | null | undefined,
  companyPriceLimitCents: number | null | undefined,
  planEntitlements: unknown,
): Pick<CompanyEffectiveLimits, "tokenLimit" | "priceLimitCents"> {
  const ent =
    planEntitlements && typeof planEntitlements === "object" && !Array.isArray(planEntitlements)
      ? (planEntitlements as Record<string, unknown>)
      : {};
  const planToken =
    ent.tokenLimit !== undefined && ent.tokenLimit !== null ? Number(ent.tokenLimit) : null;
  const planPrice =
    ent.priceLimitCents !== undefined && ent.priceLimitCents !== null
      ? Number(ent.priceLimitCents)
      : null;

  return {
    tokenLimit: companyTokenLimit != null ? Number(companyTokenLimit) : planToken,
    priceLimitCents: companyPriceLimitCents != null ? companyPriceLimitCents : planPrice,
  };
}

/**
 * 公司層有效上限：company 欄位非 null 為覆寫；否則繼承有效方案（訂閱中 plan，無則 free）。
 */
export async function resolveCompanyEffectiveLimits(
  db: Db,
  companyId: string,
): Promise<CompanyEffectiveLimits | null> {
  const companyRow = await db
    .select({
      tokenLimit: companies.tokenLimit,
      priceLimitCents: companies.priceLimitCents,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);

  if (!companyRow) return null;

  const sub = await db
    .select()
    .from(companySubscriptions)
    .where(eq(companySubscriptions.companyId, companyId))
    .then((rows) => rows[0] ?? null);

  let planRow = null as (typeof plans.$inferSelect) | null;
  if (sub && ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)) {
    planRow = await db
      .select()
      .from(plans)
      .where(eq(plans.id, sub.planId))
      .then((rows) => rows[0] ?? null);
  }
  if (!planRow) {
    planRow = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, "free"))
      .then((rows) => rows[0] ?? null);
  }

  const merged = mergePlanEntitlementsWithCompanyOverrides(
    companyRow.tokenLimit,
    companyRow.priceLimitCents,
    planRow?.entitlements,
  );

  return {
    ...merged,
    planId: planRow?.id ?? null,
    planSlug: planRow?.slug ?? null,
  };
}
