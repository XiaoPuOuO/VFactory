import { describe, expect, it } from "vitest";
import { normalizeRunErrorForCluster } from "../utils/run-error-normalize.js";

describe("normalizeRunErrorForCluster", () => {
  it("replaces uuid-like segments", () => {
    const s =
      "task failed for 550e8400-e29b-41d4-a716-446655440000: connection reset";
    expect(normalizeRunErrorForCluster(s)).toContain("<uuid>");
    expect(normalizeRunErrorForCluster(s)).not.toContain("550e8400");
  });

  it("uses first line only", () => {
    expect(normalizeRunErrorForCluster("a\nb")).toBe("a");
  });

  it("handles null", () => {
    expect(normalizeRunErrorForCluster(null)).toBe("(no_message)");
  });
});
