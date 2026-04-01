/**
 * 衝突解決優先序（報告 G10）：human_override > alert_driven > ceo_roadmap > scheduled
 */
export type PlanningSource = "human_override" | "alert_driven" | "ceo_roadmap" | "scheduled";

const ORDER: PlanningSource[] = [
  "human_override",
  "alert_driven",
  "ceo_roadmap",
  "scheduled",
];

export function planningSourceRank(source: PlanningSource): number {
  return ORDER.indexOf(source);
}

/** 若 a 優先於 b 則回傳負數（與 Array.sort 一致）。 */
export function comparePlanningPriority(a: PlanningSource, b: PlanningSource): number {
  return planningSourceRank(a) - planningSourceRank(b);
}

export function pickHigherPrioritySource(
  candidates: PlanningSource[],
): PlanningSource | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, cur) =>
    comparePlanningPriority(cur, best) < 0 ? cur : best,
  );
}
