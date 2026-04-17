import { describe, expect, it } from "vitest";
import { resolveLicenseTierI18nKey } from "./planLicenseTier";

describe("resolveLicenseTierI18nKey", () => {
  it("maps free and community to community", () => {
    expect(resolveLicenseTierI18nKey("free")).toBe("community");
    expect(resolveLicenseTierI18nKey("community")).toBe("community");
    expect(resolveLicenseTierI18nKey("FREE")).toBe("community");
  });

  it("maps pro, team, and business to business", () => {
    expect(resolveLicenseTierI18nKey("pro")).toBe("business");
    expect(resolveLicenseTierI18nKey("team")).toBe("business");
    expect(resolveLicenseTierI18nKey("business")).toBe("business");
  });

  it("maps enterprise slug", () => {
    expect(resolveLicenseTierI18nKey("enterprise")).toBe("enterprise");
  });

  it("maps self-hosted style slugs to selfHosted", () => {
    expect(resolveLicenseTierI18nKey("self_hosted")).toBe("selfHosted");
    expect(resolveLicenseTierI18nKey("self-hosted-enterprise")).toBe("selfHosted");
    expect(resolveLicenseTierI18nKey("on-prem")).toBe("selfHosted");
  });

  it("returns null for unknown slugs", () => {
    expect(resolveLicenseTierI18nKey("custom_platinum")).toBeNull();
  });
});
