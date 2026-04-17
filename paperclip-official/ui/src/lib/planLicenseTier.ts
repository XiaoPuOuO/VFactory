import type { TFunction } from "i18next";

/** 內部授權層級代號（與 `billing.licenseTier.*` 語系鍵對齊）。 */
export type LicenseTierI18nKey = "community" | "business" | "enterprise" | "selfHosted";

const SLUG_TO_TIER_KEY: Record<string, LicenseTierI18nKey> = {
  free: "community",
  community: "community",
  oss: "community",
  pro: "business",
  team: "business",
  business: "business",
  professional: "business",
  enterprise: "enterprise",
  self_hosted: "selfHosted",
  self_hosted_enterprise: "selfHosted",
  on_prem: "selfHosted",
  onprem: "selfHosted",
  dedicated: "selfHosted",
};

function normalizePlanSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * 將資料庫／API 的 `plan.slug` 對應到授權層級語系鍵。
 * 未知 slug（例如營運自訂方案）回傳 null，UI 應回落到 API 的 name／description。
 */
export function resolveLicenseTierI18nKey(slug: string): LicenseTierI18nKey | null {
  const key = SLUG_TO_TIER_KEY[normalizePlanSlug(slug)];
  return key ?? null;
}

export function planTierDisplayName(t: TFunction<"billing">, slug: string, fallbackName?: string): string {
  const tier = resolveLicenseTierI18nKey(slug);
  if (tier) {
    return t(`licenseTier.${tier}.name`);
  }
  return (fallbackName?.trim() || slug).trim();
}

export function planTierDisplayDescription(
  t: TFunction<"billing">,
  slug: string,
  fallbackDescription?: string | null,
): string {
  const tier = resolveLicenseTierI18nKey(slug);
  if (tier) {
    return t(`licenseTier.${tier}.description`);
  }
  return (fallbackDescription ?? "").trim();
}
