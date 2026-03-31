import { describe, expect, it } from "vitest";
import { sanitizeGeneratedSessionTitle } from "../services/chat-session-title.js";

describe("sanitizeGeneratedSessionTitle", () => {
  it("trims and strips outer quotes", () => {
    expect(sanitizeGeneratedSessionTitle('  「討論 HOP-73」  ')).toBe("討論 HOP-73");
  });

  it("returns null for empty", () => {
    expect(sanitizeGeneratedSessionTitle("   \n  ")).toBeNull();
  });

  it("truncates very long output", () => {
    const long = "a".repeat(100);
    const out = sanitizeGeneratedSessionTitle(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(82);
  });
});
