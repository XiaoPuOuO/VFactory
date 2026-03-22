/**
 * 共用 CSV 匯出查詢參數（與 costs/export 行為一致）。
 */

export function csvEscapeCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const EXPORT_CSV_DEFAULT_LIMIT = 2000;
export const EXPORT_CSV_MAX_LIMIT = 5000;

export type ExportCsvDateRange = { from?: Date; to?: Date };

export type ExportCsvCursor = { at: Date; id: string };

export type ParsedExportCsvQuery = {
  range: ExportCsvDateRange | undefined;
  scopeAll: boolean;
  limit: number;
  cursor: ExportCsvCursor | undefined;
};

function parseDateRange(query: Record<string, unknown>): ExportCsvDateRange | undefined {
  const from = query.from ? new Date(query.from as string) : undefined;
  const to = query.to ? new Date(query.to as string) : undefined;
  return from || to ? { from, to } : undefined;
}

export function parseExportCsvQuery(
  query: Record<string, unknown>,
  opts?: { defaultLimit?: number; maxLimit?: number },
): ParsedExportCsvQuery {
  const defaultLimit = opts?.defaultLimit ?? EXPORT_CSV_DEFAULT_LIMIT;
  const maxLimit = opts?.maxLimit ?? EXPORT_CSV_MAX_LIMIT;

  let range = parseDateRange(query);
  const scopeAll = query.scope === "all";
  if (scopeAll) {
    range = undefined;
  } else if (!range?.from && !range?.to) {
    const now = new Date();
    range = {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: undefined,
    };
  }

  const limitRaw = query.limit != null ? Number(query.limit) : defaultLimit;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(maxLimit, Math.max(1, Math.floor(limitRaw)))
    : defaultLimit;

  let cursor: ExportCsvCursor | undefined;
  if (query.cursor != null && String(query.cursor) !== "") {
    try {
      const raw = Buffer.from(String(query.cursor), "base64url").toString("utf8");
      const parsed = JSON.parse(raw) as { o?: string; id?: string };
      if (!parsed.o || !parsed.id) {
        throw new Error("Invalid cursor");
      }
      cursor = { at: new Date(parsed.o), id: parsed.id };
    } catch {
      throw new Error("Invalid cursor");
    }
  }

  const effectiveRange: ExportCsvDateRange = scopeAll ? {} : (range ?? {});
  return { range: effectiveRange, scopeAll, limit, cursor };
}
