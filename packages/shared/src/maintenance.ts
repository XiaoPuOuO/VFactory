/**
 * 公司層維護視窗與喚醒急停（與 DB `companies` 欄位對應）。
 */

export interface CompanyMaintenanceWindow {
  /** UTC ISO8601 */
  start: string;
  /** UTC ISO8601 */
  end: string;
}

/** 目前時間是否落在任一維護區間內（含 start、end 端點）。 */
export function isWithinMaintenanceWindows(
  now: Date,
  windows: CompanyMaintenanceWindow[] | null | undefined,
): boolean {
  if (!windows?.length) return false;
  const t = now.getTime();
  for (const w of windows) {
    const s = new Date(w.start).getTime();
    const e = new Date(w.end).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e) return true;
  }
  return false;
}

/** 是否仍處於營運急停（wakeups_paused_until 尚未到期）。 */
export function isWakeupsPausedUntilActive(
  pausedUntil: Date | string | null | undefined,
  now: Date,
): boolean {
  if (pausedUntil == null) return false;
  const until = pausedUntil instanceof Date ? pausedUntil : new Date(pausedUntil);
  if (!Number.isFinite(until.getTime())) return false;
  return now.getTime() < until.getTime();
}
