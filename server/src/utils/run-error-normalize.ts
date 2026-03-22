/**
 * 將 run 錯誤文字正規化為聚類鍵（不含 error_code；上層應優先使用 error_code）。
 */
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ABS_PATH_RE = /(?:\/[\w.-]+)+\/?/g;

export function normalizeRunErrorForCluster(message: string | null | undefined): string {
  if (message == null || typeof message !== "string") return "(no_message)";
  let s = message.split(/\r?\n/)[0] ?? message;
  s = s.replace(UUID_RE, "<uuid>");
  s = s.replace(ABS_PATH_RE, "<path>");
  s = s.replace(/\b\d{6,}\b/g, "<n>");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 240) s = `${s.slice(0, 237)}...`;
  return s.length > 0 ? s : "(empty)";
}
