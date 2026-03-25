import type { Query } from "@tanstack/react-query";

const STORAGE_KEY = "paperclip.query.v1";

/**
 * 僅持久化成功載入的 Issues 相關唯讀查詢（列表、Inbox touched、議題詳情），供離線時顯示快取。
 */
export function shouldPersistReadonlyIssueQuery(query: Query): boolean {
  if (query.state.status !== "success") return false;
  const k = query.queryKey;
  if (!Array.isArray(k) || k.length < 2) return false;
  if (k[0] !== "issues") return false;

  if (k[1] === "detail") return true;

  if (k.length === 2 && typeof k[1] === "string") return true;

  if (k[2] === "touched-by-me") return true;

  return false;
}

export function getQueryPersisterStorageKey() {
  return STORAGE_KEY;
}
