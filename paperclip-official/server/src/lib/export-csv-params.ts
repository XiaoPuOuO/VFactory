/**
 * 共用 CSV 匯出查詢參數（與 costs/export 行為一致）。
 */

export function csvEscapeCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // Spreadsheet formula injection mitigation:
  // If a cell value starts with one of these characters after leading whitespace,
  // Excel/Sheets may treat it as a formula when opened from CSV.
  // Prefix with a single quote to force "text" interpretation.
  const m = /^(\s*)(.*)$/.exec(s);
  const leadingWs = m?.[1] ?? "";
  const rest = m?.[2] ?? s;
  const firstNonWsChar = rest.trimStart().charAt(0);
  const neutralized =
    firstNonWsChar && /^[=+\-@]$/.test(firstNonWsChar)
      ? `${leadingWs}'${rest}`
      : s;

  if (/[",\n\r]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
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
