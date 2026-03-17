/**
 * Shared attachment content-type configuration.
 *
 * By default only image types are allowed.  Set the
 * `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` environment variable to a
 * comma-separated list of MIME types or wildcard patterns to expand the
 * allowed set.
 *
 * Examples:
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf
 *   PAPERCLIP_ALLOWED_ATTACHMENT_TYPES=image/*,application/pdf,text/*
 *
 * Supported pattern syntax:
 *   - Exact types:   "application/pdf"
 *   - Wildcards:     "image/*"  or  "application/vnd.openxmlformats-officedocument.*"
 */

export const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

/**
 * Parse a comma-separated list of MIME type patterns into a normalised array.
 * Returns the default image-only list when the input is empty or undefined.
 */
export function parseAllowedTypes(raw: string | undefined): string[] {
  if (!raw) return [...DEFAULT_ALLOWED_TYPES];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_TYPES];
}

/**
 * Check whether `contentType` matches any entry in `allowedPatterns`.
 *
 * Supports exact matches ("application/pdf") and wildcard / prefix
 * patterns ("image/*", "application/vnd.openxmlformats-officedocument.*").
 */
export function matchesContentType(contentType: string, allowedPatterns: string[]): boolean {
  const ct = contentType.toLowerCase();
  return allowedPatterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("/*") || pattern.endsWith(".*")) {
      return ct.startsWith(pattern.slice(0, -1));
    }
    return ct === pattern;
  });
}

// ---------- Module-level singletons read once at startup ----------

const allowedPatterns: string[] = parseAllowedTypes(
  process.env.PAPERCLIP_ALLOWED_ATTACHMENT_TYPES,
);

/** Convenience wrapper using the process-level allowed list. */
export function isAllowedContentType(contentType: string): boolean {
  return matchesContentType(contentType, allowedPatterns);
}

export const MAX_ATTACHMENT_BYTES =
  Number(process.env.PAPERCLIP_ATTACHMENT_MAX_BYTES) || 10 * 1024 * 1024;

// ---------- Icon upload (company/project avatar) ----------
// 僅允許 PNG/JPEG，較小體積，並以 magic bytes 驗證防止 polyglot/內嵌腳本。

export const ICON_ALLOWED_CONTENT_TYPES: readonly string[] = ["image/png", "image/jpeg"];

export const MAX_ICON_BYTES =
  Number(process.env.PAPERCLIP_ICON_MAX_BYTES) || 512 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * 檢查 buffer 是否為允許的圖示格式（依 magic bytes），防止偽裝副檔名或 polyglot 檔案。
 * 僅接受 PNG、JPEG，且內容與宣告的 contentType 一致。
 */
export function validateIconMagicBytes(
  buffer: Buffer,
  contentType: string,
): { ok: true } | { ok: false; error: string } {
  const ct = contentType.toLowerCase();
  if (buffer.length < 3) {
    return { ok: false, error: "Image file too small" };
  }
  const isPng = buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = buffer.subarray(0, 3).equals(JPEG_SIGNATURE);

  if (ct === "image/png" && isPng) return { ok: true };
  if ((ct === "image/jpeg" || ct === "image/jpg") && isJpeg) return { ok: true };
  if (isPng) return { ok: false, error: "Declared type must be image/png for PNG file" };
  if (isJpeg) return { ok: false, error: "Declared type must be image/jpeg for JPEG file" };
  return { ok: false, error: "Only PNG and JPEG images are allowed; file signature did not match" };
}

export function isAllowedIconContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ICON_ALLOWED_CONTENT_TYPES.includes(ct);
}
