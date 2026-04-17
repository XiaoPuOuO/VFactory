import { describe, expect, it } from "vitest";
import { mergePlanEntitlementsWithCompanyOverrides } from "../services/billing/entitlements.ts";

describe("mergePlanEntitlementsWithCompanyOverrides", () => {
  it("inherits plan token and price when company overrides are null", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(null, null, {
      tokenLimit: 1_000_000,
      priceLimitCents: 5000,
    });
    expect(r.tokenLimit).toBe(1_000_000);
    expect(r.priceLimitCents).toBe(5000);
  });

  it("company non-null token overrides plan", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(99, null, { tokenLimit: 1_000_000 });
    expect(r.tokenLimit).toBe(99);
    expect(r.priceLimitCents).toBeNull();
  });

  it("company non-null price overrides plan", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(null, 12345, { priceLimitCents: 100 });
    expect(r.tokenLimit).toBeNull();
    expect(r.priceLimitCents).toBe(12345);
  });

  it("treats non-object entitlements as empty plan", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(null, null, null);
    expect(r.tokenLimit).toBeNull();
    expect(r.priceLimitCents).toBeNull();
  });

  it("treats company token 0 as inherit plan (same as null), not a literal cap of zero", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(0, null, { tokenLimit: 1_000_000 });
    expect(r.tokenLimit).toBe(1_000_000);
  });

  it("treats company price 0 as inherit plan", () => {
    const r = mergePlanEntitlementsWithCompanyOverrides(null, 0, { priceLimitCents: 99 });
    expect(r.priceLimitCents).toBe(99);
  });
});
