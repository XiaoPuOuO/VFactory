/**
 * 從訊息內文擷取 Issue 識別碼（例如 HOP-15、PAP-123），並展開範圍（如 HOP-17~HOP-26）。
 * 僅匹配 PREFIX-數字 格式，且 prefix 與公司 issuePrefix 一致（不區分大小寫）。
 * 支援 ~ 與 ～ 兩種範圍符號。
 */
export function extractIssueIdentifiers(body: string, issuePrefix: string): string[] {
  if (!body || !issuePrefix || !issuePrefix.trim()) return [];
  const prefix = issuePrefix.trim().toUpperCase();
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const seen = new Set<string>();

  const rangeRe = new RegExp(
    `\\b(${escaped})-(\\d+)\\s*[~～]\\s*(${escaped})-(\\d+)\\b`,
    "gi",
  );
  let rangeMatch: RegExpExecArray | null;
  const rangeReCopy = new RegExp(rangeRe.source, "gi");
  while ((rangeMatch = rangeReCopy.exec(body)) !== null) {
    const a = parseInt(rangeMatch[2], 10);
    const b = parseInt(rangeMatch[4], 10);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let n = lo; n <= hi; n++) {
      const id = `${prefix}-${n}`;
      seen.add(id);
    }
  }

  const standaloneRe = new RegExp(`\\b${escaped}-\\d+\\b`, "gi");
  const standalones = body.match(standaloneRe) ?? [];
  for (const m of standalones) {
    seen.add(m.toUpperCase());
  }

  return [...seen].sort((x, y) => {
    const nx = parseInt(x.split("-")[1], 10);
    const ny = parseInt(y.split("-")[1], 10);
    return nx - ny;
  });
}
