import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { assertBoardOrAgentWorkflowWorker } from "../routes/authz.js";

function reqWithActor(actor: Express.Request["actor"]): Request {
  return { actor } as Request;
}

describe("assertBoardOrAgentWorkflowWorker", () => {
  it("allows board after company access", async () => {
    const req = reqWithActor({
      type: "board",
      source: "local_implicit",
      userId: "u1",
      companyIds: ["c1"],
    });
    const db = {} as any;
    await expect(assertBoardOrAgentWorkflowWorker(req, db, "c1", "run-1")).resolves.toBeUndefined();
  });

  it("allows agent when run.agentId matches", async () => {
    const req = reqWithActor({
      type: "agent",
      agentId: "a1",
      companyId: "c1",
      source: "agent_key",
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ agentId: "a1" }]),
          }),
        }),
      }),
    };
    await expect(assertBoardOrAgentWorkflowWorker(req, db as any, "c1", "run-1")).resolves.toBeUndefined();
  });

  it("forbids agent when run is assigned to another agent", async () => {
    const req = reqWithActor({
      type: "agent",
      agentId: "a1",
      companyId: "c1",
      source: "agent_key",
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ agentId: "a2" }]),
          }),
        }),
      }),
    };
    await expect(assertBoardOrAgentWorkflowWorker(req, db as any, "c1", "run-1")).rejects.toMatchObject({
      message: "Agent is not assigned to this workflow run",
    });
  });
});
