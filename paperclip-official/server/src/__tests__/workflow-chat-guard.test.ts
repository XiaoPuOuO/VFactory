import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { assertAgentChatAllowedForWorkflow } from "../lib/workflow-chat-guard.js";

function reqWithActor(actor: Express.Request["actor"], headerMap: Record<string, string> = {}): Request {
  return {
    actor,
    header: (name: string) => headerMap[name.toLowerCase()] ?? headerMap[name] ?? undefined,
  } as Request;
}

describe("assertAgentChatAllowedForWorkflow", () => {
  it("no-ops for board actor", async () => {
    const db = { select: vi.fn() };
    await assertAgentChatAllowedForWorkflow(
      db as never,
      reqWithActor({ type: "board", source: "local_implicit", userId: "u1" }),
      "c1",
      "room-1",
      "board",
      null,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("no-ops when agentId is null", async () => {
    const db = { select: vi.fn() };
    await assertAgentChatAllowedForWorkflow(
      db as never,
      reqWithActor({ type: "agent", agentId: "", companyId: "c1" } as never),
      "c1",
      "room-1",
      "agent",
      null,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows agent when no active workflow run for this room", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    await assertAgentChatAllowedForWorkflow(
      db as never,
      reqWithActor({ type: "agent", agentId: "a1", companyId: "c1",
      } as never),
      "c1",
      "room-1",
      "agent",
      "a1",
    );
  });

  it("rejects agent when a non-terminal workflow run is bound to room", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "run-1" }]),
          }),
        }),
      }),
    };
    await expect(
      assertAgentChatAllowedForWorkflow(
        db as never,
        reqWithActor({ type: "agent", agentId: "a1", companyId: "c1" } as never),
        "c1",
        "room-1",
        "agent",
        "a1",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows override when board session posts as resolved agent with header", async () => {
    const db = { select: vi.fn() };
    await assertAgentChatAllowedForWorkflow(
      db as never,
      reqWithActor(
        { type: "board", source: "local_implicit", userId: "u1" },
        { "x-paperclip-workflow-chat-override": "1" },
      ),
      "c1",
      "room-1",
      "agent",
      "a1",
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows agent override when env WORKFLOW_CHAT_AGENT_OVERRIDE=1 and header", async () => {
    const prev = process.env.WORKFLOW_CHAT_AGENT_OVERRIDE;
    process.env.WORKFLOW_CHAT_AGENT_OVERRIDE = "1";
    const db = { select: vi.fn() };
    try {
      await assertAgentChatAllowedForWorkflow(
        db as never,
        reqWithActor({ type: "agent", agentId: "a1" } as never, { "x-paperclip-workflow-chat-override": "1" }),
        "c1",
        "room-1",
        "agent",
        "a1",
      );
      expect(db.select).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.WORKFLOW_CHAT_AGENT_OVERRIDE;
      else process.env.WORKFLOW_CHAT_AGENT_OVERRIDE = prev;
    }
  });
});
