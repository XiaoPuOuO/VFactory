import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWorkflowWorkerContinuationPromptBlock } from "../services/workflow-heartbeat-bridge.js";

describe("workflow-heartbeat-bridge", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("buildWorkflowWorkerContinuationPromptBlock includes run id and payload", () => {
    const block = buildWorkflowWorkerContinuationPromptBlock({
      runId: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      pendingWorker: {
        stepId: "s1",
        kind: "prompt",
        payload: "Do the thing",
        createdAt: new Date().toISOString(),
      },
    });
    expect(block).toContain("11111111-1111-1111-1111-111111111111");
    expect(block).toContain("22222222-2222-2222-2222-222222222222");
    expect(block).toContain("Do the thing");
    expect(block).toContain("worker-step-result");
    expect(block).toContain("409");
    expect(block.toLowerCase()).toContain("do not call post");
  });

  it("buildWorkflowWorkerContinuationPromptBlock is shorter when HEARTBEAT_WORKFLOW_CONTINUATION_MINIMAL is set", () => {
    vi.stubEnv("HEARTBEAT_WORKFLOW_CONTINUATION_MINIMAL", "1");
    const block = buildWorkflowWorkerContinuationPromptBlock({
      runId: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      pendingWorker: {
        stepId: "s1",
        kind: "prompt",
        payload: "Do the thing",
        createdAt: new Date().toISOString(),
      },
    });
    expect(block.length).toBeLessThan(450);
    expect(block).toContain("11111111-1111-1111-1111-111111111111");
    expect(block).toContain("worker-step-result");
  });
});
