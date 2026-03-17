import type { TFunction } from "i18next";

/**
 * 依目前語系回傳相對時間字串（如「3 分鐘前」／「3m ago」）。
 * 需在元件內以 useTranslation() 取得 t 後傳入。
 */
export function formatRelativeTime(t: TFunction, date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return t("time.justNow");
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return t("time.minutesAgo", { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("time.hoursAgo", { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t("time.daysAgo", { count: diffDay });
  const diffWeek = Math.round(diffDay / 7);
  if (diffWeek < 4) return t("time.weeksAgo", { count: diffWeek });
  const diffMo = Math.round(diffDay / 30);
  return t("time.monthsAgo", { count: diffMo });
}
