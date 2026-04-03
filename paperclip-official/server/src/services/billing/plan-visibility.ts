import type { plans } from "@paperclipai/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 正規化 DB jsonb 中的公司 id 陣列。 */
export function normalizeAllowedCompanyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && UUID_RE.test(x));
}

export type PlanVisibilityFields = Pick<
  typeof plans.$inferSelect,
  "active" | "catalogVisible" | "allowedCompanyIds"
>;

/**
 * 公司是否可在帳單／定價頁看到並對此方案結帳。
 * - allowedCompanyIds 非空：僅名單內公司（企業定製、內部 Infinite）。
 * - 名單為空且 catalogVisible：全站符合條件的公司。
 * - 名單為空且非 catalogVisible：一般列表不顯示（僅管理後台維護）。
 */
export function planSelectableByCompany(plan: PlanVisibilityFields, companyId: string): boolean {
  if (!plan.active) return false;
  const ids = normalizeAllowedCompanyIds(plan.allowedCompanyIds);
  if (ids.length > 0) return ids.includes(companyId);
  return plan.catalogVisible;
}
