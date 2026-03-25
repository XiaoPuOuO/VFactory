import { ISSUE_STATUSES, type GoalProgressIssueStatusCounts } from "@paperclipai/shared";

export function emptyIssueStatusCounts(): GoalProgressIssueStatusCounts {
  const o = {} as GoalProgressIssueStatusCounts;
  for (const s of ISSUE_STATUSES) o[s] = 0;
  return o;
}

export function addIssueStatusCount(
  base: GoalProgressIssueStatusCounts,
  status: string,
  n: number,
): void {
  if ((ISSUE_STATUSES as readonly string[]).includes(status)) {
    base[status as keyof GoalProgressIssueStatusCounts] += n;
  }
}
