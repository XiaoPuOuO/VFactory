import { createHash } from "node:crypto";

/**
 * 綠界 CheckMacValue（SHA256）。
 * 參考官方：先組字串 → urlencode（.NET 規則）→ 轉小寫 → SHA256 → 轉大寫。
 */
export function ecpayBuildCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIv: string,
): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue" && params[k] !== "" && params[k] != null)
    .sort((a, b) => a.localeCompare(b));
  const pairs = keys.map((k) => `${k}=${params[k]}`).join("&");
  let raw = `HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`;
  let encoded = encodeURIComponent(raw);
  encoded = encoded.toLowerCase();
  encoded = encoded.replace(/%20/g, "+");
  encoded = encoded.replace(/%2d/g, "-");
  encoded = encoded.replace(/%5f/g, "_");
  encoded = encoded.replace(/%2e/g, ".");
  encoded = encoded.replace(/%21/g, "!");
  encoded = encoded.replace(/%2a/g, "*");
  encoded = encoded.replace(/%28/g, "(");
  encoded = encoded.replace(/%29/g, ")");
  const hash = createHash("sha256").update(encoded).digest("hex");
  return hash.toUpperCase();
}

export function ecpayVerifyCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIv: string,
): boolean {
  const expected = params.CheckMacValue;
  if (!expected) return false;
  const computed = ecpayBuildCheckMacValue(params, hashKey, hashIv);
  return computed === expected;
}
