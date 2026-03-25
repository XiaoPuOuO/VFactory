import { describe, expect, it } from "vitest";
import { pruneSelectionToVisible, selectionSetsEqual } from "./issues-list-selection";

describe("pruneSelectionToVisible", () => {
  it("drops ids that are not in the visible list", () => {
    const next = pruneSelectionToVisible(new Set(["a", "b", "c"]), ["b"]);
    expect([...next].sort()).toEqual(["b"]);
  });

  it("returns empty when nothing visible matches", () => {
    expect(pruneSelectionToVisible(new Set(["x"]), ["a", "b"]).size).toBe(0);
  });
});

describe("selectionSetsEqual", () => {
  it("is true for same members regardless of Set instance", () => {
    expect(selectionSetsEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
  });

  it("is false when sizes differ", () => {
    expect(selectionSetsEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});
