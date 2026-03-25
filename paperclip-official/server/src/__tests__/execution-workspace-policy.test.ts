import { describe, expect, it } from "vitest";
import {
  orderProjectWorkspaceRowsForIssue,
  parseIssueExecutionWorkspaceSettings,
} from "../services/execution-workspace-policy.js";

describe("orderProjectWorkspaceRowsForIssue", () => {
  const rows = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "a" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "b" },
    { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", name: "c" },
  ];

  it("keeps order when no preference", () => {
    const { ordered, preferredMissingFromProject } = orderProjectWorkspaceRowsForIssue(rows, null);
    expect(preferredMissingFromProject).toBe(false);
    expect(ordered.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("moves preferred row first", () => {
    const { ordered, preferredMissingFromProject } = orderProjectWorkspaceRowsForIssue(
      rows,
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
    expect(preferredMissingFromProject).toBe(false);
    expect(ordered.map((r) => r.id)).toEqual([
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });

  it("reports missing preferred id", () => {
    const { ordered, preferredMissingFromProject } = orderProjectWorkspaceRowsForIssue(
      rows,
      "dddddddd-dddd-dddd-dddd-dddddddddddd",
    );
    expect(preferredMissingFromProject).toBe(true);
    expect(ordered.map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe("parseIssueExecutionWorkspaceSettings", () => {
  it("parses projectWorkspaceId", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const parsed = parseIssueExecutionWorkspaceSettings({
      mode: "isolated",
      projectWorkspaceId: id,
    });
    expect(parsed?.projectWorkspaceId).toBe(id);
  });

  it("returns null when only invalid projectWorkspaceId", () => {
    const parsed = parseIssueExecutionWorkspaceSettings({
      projectWorkspaceId: "not-a-uuid",
    });
    expect(parsed).toBeNull();
  });
});
