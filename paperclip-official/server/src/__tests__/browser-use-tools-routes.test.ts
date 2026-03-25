import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { browserUseToolRoutes } from "../routes/browser-use-tools.js";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/browser-use-gateway.js", () => ({
  browserUseGatewayService: () => ({
    invoke: mockInvoke,
  }),
}));

vi.mock("../services/index.js", () => ({
  logActivity: mockLogActivity,
}));

function createApp() {
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
  app.use("/api", browserUseToolRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("browser-use tool routes", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("forwards navigate request to gateway", async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      data: { url: "https://example.com" },
      error: null,
      traceId: "trace-1",
    });

    const res = await request(createApp()).post("/api/tools/browser-use/navigate").send({
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
  });
});
