import { createHash } from "node:crypto";

/**
 * 同一個 heartbeat run（X-Paperclip-Run-Id）內若重複 POST 相同 hire 內容，回傳第一次成功結果，避免重複建立 agent。
 * 僅記憶體、單程序；足以攔截 adapter 連續兩次相同請求。
 */
const store = new Map<string, { ts: number; responseJson: string }>();
const MAX_AGE_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 5000;

function prune(): void {
  const now = Date.now();
  if (store.size <= MAX_ENTRIES) {
    for (const [k, v] of store) {
      if (now - v.ts > MAX_AGE_MS) store.delete(k);
    }
    return;
  }
  const entries = [...store.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const drop = Math.max(0, entries.length - MAX_ENTRIES + 100);
  for (let i = 0; i < drop; i++) {
    store.delete(entries[i][0]);
  }
  for (const [k, v] of store) {
    if (now - v.ts > MAX_AGE_MS) store.delete(k);
  }
}

function stableHireFingerprint(body: {
  name: string;
  role?: string;
  title?: string | null;
  reportsTo?: string | null;
  adapterType?: string;
}): string {
  const normalized = JSON.stringify({
    name: body.name,
    role: body.role ?? "general",
    title: body.title ?? null,
    reportsTo: body.reportsTo ?? null,
    adapterType: body.adapterType ?? "process",
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function hireDedupeKey(
  companyId: string,
  runId: string,
  body: {
    name: string;
    role?: string;
    title?: string | null;
    reportsTo?: string | null;
    adapterType?: string;
  },
): string {
  return `${companyId}:${runId}:${stableHireFingerprint(body)}`;
}

export function getCachedAgentHireResponse(key: string): unknown | null {
  prune();
  const v = store.get(key);
  if (!v || Date.now() - v.ts > MAX_AGE_MS) return null;
  try {
    return JSON.parse(v.responseJson) as unknown;
  } catch {
    store.delete(key);
    return null;
  }
}

export function setCachedAgentHireResponse(key: string, response: unknown): void {
  store.set(key, { ts: Date.now(), responseJson: JSON.stringify(response) });
}
