import { describe, expect, it } from "vitest";
import { addIssueStatusCount, emptyIssueStatusCounts } from "../services/goal-progress-utils.ts";

describe("goal-progress-utils", () => {
  it("initializes all issue statuses to zero", () => {
    const c = emptyIssueStatusCounts();
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(0);
    expect(c.done).toBe(0);
    expect(c.in_progress).toBe(0);
  });

  it("adds counts for known statuses", () => {
    const c = emptyIssueStatusCounts();
    addIssueStatusCount(c, "done", 2);
    addIssueStatusCount(c, "todo", 1);
    expect(c.done).toBe(2);
    expect(c.todo).toBe(1);
  });

  it("ignores unknown status strings", () => {
    const c = emptyIssueStatusCounts();
    addIssueStatusCount(c, "not_a_status", 5);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
