/**
 * 公司層 Token／花費上限：數值 **0** 與 **null** 同義，表示「未設公司覆寫」，沿用方案 entitlements。
 * 若將 0 當成字面「上限為零」，則 tokenUsage ≥ 0 永遠成立，會誤判為永久超標。
 */
export function coerceZeroCompanyLimitsToNull<T extends Record<string, unknown>>(payload: T): T {
  const next = { ...payload } as Record<string, unknown>;
  if (next.tokenLimit === 0) next.tokenLimit = null;
  if (next.priceLimitCents === 0) next.priceLimitCents = null;
  return next as T;
}
