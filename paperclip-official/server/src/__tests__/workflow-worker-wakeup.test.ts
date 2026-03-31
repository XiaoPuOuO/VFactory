import { describe, expect, it, vi } from "vitest";
import { wakeAgentAfterWorkflowWorkerStep } from "../lib/workflow-worker-wakeup.js";
import type { ChatHeartbeat } from "../services/chat.js";

describe("wakeAgentAfterWorkflowWorkerStep", () => {
  it("calls heartbeat.wakeup with chat taskKey for non-terminal run", async () => {
    const wakeup = vi.fn().mockResolvedValue(undefined);
    const heartbeat: ChatHeartbeat = { wakeup };
    const t = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    await wakeAgentAfterWorkflowWorkerStep(heartbeat, {
      id: "run-1",
      agentId: "agent-1",
      chatRoomId: "room-1",
      status: "waiting_worker",
      updatedAt: t,
    });
    expect(wakeup).toHaveBeenCalledTimes(1);
    expect(wakeup).toHaveBeenCalledWith("agent-1", {
      source: "automation",
      triggerDetail: "workflow_continue",
      reason: "workflow_run_continue",
      contextSnapshot: {
        roomId: "room-1",
        chatRoomId: "room-1",
        taskKey: "chat:room-1",
        chatMode: "light",
        paperclipWorkflowTerminalReportDue: false,
        workflowRunId: "run-1",
      },
      idempotencyKey: `workflow:continue:run-1:${t.getTime()}`,
    });
  });

  it("sets terminal report flag when run is completed", async () => {
    const wakeup = vi.fn().mockResolvedValue(undefined);
    const heartbeat: ChatHeartbeat = { wakeup };
    const t = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    await wakeAgentAfterWorkflowWorkerStep(heartbeat, {
      id: "run-2",
      agentId: "agent-1",
      chatRoomId: "room-1",
      status: "completed",
      updatedAt: t,
    });
    expect(wakeup).toHaveBeenCalledWith("agent-1", {
      source: "automation",
      triggerDetail: "workflow_terminal",
      reason: "workflow_run_terminal_report",
      contextSnapshot: {
        roomId: "room-1",
        chatRoomId: "room-1",
        taskKey: "chat:room-1",
        chatMode: "light",
        paperclipWorkflowTerminalReportDue: true,
        workflowRunId: "run-2",
      },
      idempotencyKey: `workflow:terminal:run-2:${t.getTime()}`,
    });
  });

  it("skips when agent or chat room is missing", async () => {
    const wakeup = vi.fn();
    const heartbeat: ChatHeartbeat = { wakeup };
    await wakeAgentAfterWorkflowWorkerStep(heartbeat, {
      id: "run-1",
      agentId: null,
      chatRoomId: "room-1",
      status: "running",
      updatedAt: new Date(),
    });
    expect(wakeup).not.toHaveBeenCalled();
  });
});
