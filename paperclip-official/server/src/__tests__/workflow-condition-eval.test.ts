import { describe, expect, it } from "vitest";
import { evaluateWorkflowCondition } from "../services/workflow-condition-eval.js";

describe("evaluateWorkflowCondition", () => {
  it("evaluates equality", () => {
    expect(evaluateWorkflowCondition("{{tier}} == 'premium'", { tier: "premium" })).toBe(true);
    expect(evaluateWorkflowCondition("{{tier}} == 'premium'", { tier: "standard" })).toBe(false);
  });

  it("evaluates contains", () => {
    expect(evaluateWorkflowCondition('{{text}} contains "foo"', { text: "hello foo bar" })).toBe(true);
  });
});
