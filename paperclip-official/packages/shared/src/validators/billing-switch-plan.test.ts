import { describe, expect, it } from "vitest";
import { billingSwitchPlanSchema } from "./billing.js";

describe("billingSwitchPlanSchema", () => {
  it("parses planSlug", () => {
    expect(billingSwitchPlanSchema.parse({ planSlug: "team" })).toEqual({ planSlug: "team" });
  });

  it("rejects empty planSlug", () => {
    expect(() => billingSwitchPlanSchema.parse({ planSlug: "" })).toThrow();
  });
});
