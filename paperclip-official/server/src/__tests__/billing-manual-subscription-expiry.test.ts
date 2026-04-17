import { describe, expect, it } from "vitest";
import { isManualSubscriptionExpired } from "../services/billing/entitlements.ts";

describe("isManualSubscriptionExpired", () => {
  it("returns false for non-manual provider", () => {
    expect(isManualSubscriptionExpired("stripe", new Date("2020-01-01"), Date.now())).toBe(false);
  });

  it("returns false when manual and no end date (permanent)", () => {
    expect(isManualSubscriptionExpired("manual", null, Date.now())).toBe(false);
  });

  it("returns true when manual and end is before now", () => {
    const now = new Date("2026-06-01T12:00:00.000Z").getTime();
    expect(isManualSubscriptionExpired("manual", new Date("2026-05-01T12:00:00.000Z"), now)).toBe(true);
  });

  it("returns false when manual and end is after now", () => {
    const now = new Date("2026-06-01T12:00:00.000Z").getTime();
    expect(isManualSubscriptionExpired("manual", new Date("2026-07-01T12:00:00.000Z"), now)).toBe(false);
  });
});
