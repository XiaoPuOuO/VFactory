import { describe, expect, it } from "vitest";
import { workflowStepWorkerResultSchema } from "./workflow-worker.js";

describe("workflowStepWorkerResultSchema", () => {
  it("accepts ok with outputs", () => {
    const r = workflowStepWorkerResultSchema.parse({
      schemaVersion: 1,
      status: "ok",
      outputs: { out: "text" },
      message: "done",
    });
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.outputs?.out).toBe("text");
  });

  it("accepts error with error string", () => {
    const r = workflowStepWorkerResultSchema.parse({
      schemaVersion: 1,
      status: "error",
      error: "failed",
    });
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.error).toBe("failed");
  });

  it("rejects invalid status", () => {
    expect(() =>
      workflowStepWorkerResultSchema.parse({
        schemaVersion: 1,
        status: "maybe",
      }),
    ).toThrow();
  });
});
