import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { browserUseToolRoutes } from "../routes/browser-use-tools.js";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockCreateEvent = vi.hoisted(() => vi.fn());

vi.mock("../services/browser-use-gateway.js", () => ({
  browserUseGatewayService: () => ({
    invoke: mockInvoke,
  }),
}));

vi.mock("../services/index.js", () => ({
  logActivity: mockLogActivity,
  costService: () => ({
    createEvent: mockCreateEvent,
  }),
}));

function createApp(db: unknown) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: "run-1",
    };
    next();
  });
  app.use("/api", browserUseToolRoutes(db as any));
  app.use(errorHandler);
  return app;
}

function drizzleLikeDbForAgentLookup(companyId: string) {
  const limit = vi.fn().mockResolvedValue([{ companyId }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

describe("browser-use tool routes", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockCreateEvent.mockReset();
    mockCreateEvent.mockResolvedValue({ event: { id: "e1" }, alreadyExisted: false });
  });

  it("forwards navigate request to gateway", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { url: "https://example.com" },
      error: null,
      traceId: "trace-1",
    });

    const res = await request(createApp({})).post("/api/tools/browser-use/navigate").send({
      agentId: "agent-1",
      runId: "run-1",
      toolInput: { sessionId: "sess-1", url: "https://example.com" },
    });

    expect(res.status).toBe(200);
    expect(mockInvoke).toHaveBeenCalledWith(
      "navigate",
      expect.objectContaining({
        agentId: "agent-1",
        runId: "run-1",
      }),
    );
    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it("extract with llmUsage records a cost event", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: "extracted",
      error: null,
      traceId: "trace-1",
      llmUsage: {
        prompt_tokens: 100,
        prompt_cached_tokens: 0,
        completion_tokens: 50,
        total_tokens: 150,
      },
      llmModel: "gpt-4o-mini",
      llmProvider: "openai",
    });

    const res = await request(createApp(drizzleLikeDbForAgentLookup("company-1")))
      .post("/api/tools/browser-use/extract")
      .send({
        agentId: "00000000-0000-4000-8000-000000000001",
        runId: "run-1",
        toolInput: { sessionId: "sess-1", query: "title" },
      });

    expect(res.status).toBe(200);
    expect(mockCreateEvent).toHaveBeenCalled();
  });
});
