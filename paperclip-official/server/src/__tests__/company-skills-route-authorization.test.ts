import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";
import { companySkillRoutes } from "../routes/company-skills.js";

function createAppWithActor(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", companySkillRoutes({} as any, {} as any));
  app.use(errorHandler);
  return app;
}

const validBody = { skillMarkdown: "x" };
const invalidImportBody = { mode: "upsert" as const, skills: [{ skillMarkdown: "x" }] };

describe("company skills routes authorization", () => {
  it("rejects non-board actor for skill create", async () => {
    const app = createAppWithActor({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-1",
      runId: "run-1",
    });

    const res = await request(app).post("/api/companies/company-1/skills").send(validBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
  });

  it("rejects non-board actor for skill import", async () => {
    const app = createAppWithActor({
      type: "user",
      userId: "user-1",
      companyId: "company-1",
      runId: "run-1",
    });

    const res = await request(app)
      .post("/api/companies/company-1/skills/import")
      .send(invalidImportBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Board access required");
  });

  it("allows board actor to reach skill validation (returns 422 for invalid YAML)", async () => {
    const app = createAppWithActor({
      type: "board",
      source: "local_implicit",
      userId: "board-user-1",
      companyIds: ["company-1"],
    });

    const res = await request(app).post("/api/companies/company-1/skills").send(validBody);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Invalid skillMarkdown");
  });
});

