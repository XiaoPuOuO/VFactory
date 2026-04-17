import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, companySubscriptions, plans } from "@paperclipai/db";
import { instanceSettingsService } from "../instance-settings.js";

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * 手動指定方案：若已設定到期日且已過期，視為不再享有該方案（回落 free）。
 * Stripe／綠界訂閱不因 currentPeriodEnd 過期而在此截斷，避免與 Webhook 競態。
 */
export function isManualSubscriptionExpired(
  paymentProvider: string,
  currentPeriodEnd: Date | null,
  nowMs: number = Date.now(),
): boolean {
  if (paymentProvider !== "manual") return false;
  if (currentPeriodEnd == null) return false;
  return currentPeriodEnd.getTime() < nowMs;
}

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

  /** 0 與 null 同義：不覆寫方案（見 company-limit-fields 註解）。 */
  const useCompanyToken =
    companyTokenLimit != null && companyTokenLimit !== 0;
  const useCompanyPrice =
    companyPriceLimitCents != null && companyPriceLimitCents !== 0;

  return {
    tokenLimit: useCompanyToken ? Number(companyTokenLimit) : planToken,
    priceLimitCents: useCompanyPrice ? companyPriceLimitCents! : planPrice,
  };
}

/** 實例設定「忽略方案配額」時，自 entitlements 移除用量護欄鍵再合併。 */
function stripPlanUsageCapsFromEntitlements(entitlements: unknown): unknown {
  if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) {
    return {};
  }
  const o = { ...(entitlements as Record<string, unknown>) };
  delete o.tokenLimit;
  delete o.priceLimitCents;
  return o;
}

/**
 * 公司層有效上限：company 欄位非 null 為覆寫；否則繼承有效方案（訂閱中 plan，無則 free）。
 * 若實例設定 billing_ignore_plan_usage_caps 啟用，則不採用方案之 tokenLimit／priceLimitCents。
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
  if (
    sub &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status) &&
    !isManualSubscriptionExpired(sub.paymentProvider, sub.currentPeriodEnd)
  ) {
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

  const ignorePlanCaps = await instanceSettingsService(db).getBillingIgnorePlanUsageCaps();
  const planEntitlementsForMerge = ignorePlanCaps
    ? stripPlanUsageCapsFromEntitlements(planRow?.entitlements)
    : planRow?.entitlements;

  const merged = mergePlanEntitlementsWithCompanyOverrides(
    companyRow.tokenLimit,
    companyRow.priceLimitCents,
    planEntitlementsForMerge,
  );

  return {
    ...merged,
    planId: planRow?.id ?? null,
    planSlug: planRow?.slug ?? null,
  };
}
