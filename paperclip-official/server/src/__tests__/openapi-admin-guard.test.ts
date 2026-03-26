import express from "express";
import request from "supertest";
import { Router } from "express";
import { describe, expect, it } from "vitest";
import { requireOpenApiAdminGroup } from "../middleware/openapi-admin-guard.js";

function createDbMockWithGroup(group: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(group ? [{ group }] : []),
      }),
    }),
  };
}

function createAppWithActor(actor: any, group: string | null) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });

  const db = createDbMockWithGroup(group) as any;

  const apiRouter = Router();
  apiRouter.use(requireOpenApiAdminGroup(db));
  apiRouter.get("/openapi.json", (_req, res) => res.json({ ok: true }));

  app.use("/api", apiRouter);
  return app;
}

describe("openapi admin guard", () => {
  it("returns 401 when not logged in", async () => {
    const app = createAppWithActor({ type: "none", source: "none" }, "admin");
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(401);
  });

  it("returns 403 when logged in but not session board", async () => {
    const app = createAppWithActor({ type: "board", source: "token", userId: "u1" }, "admin");
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(403);
  });

  it("returns 403 when logged in session board but group is not admin", async () => {
    const app = createAppWithActor({ type: "board", source: "session", userId: "u1" }, "default");
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(403);
  });

  it("allows when logged in session board and group is admin", async () => {
    const app = createAppWithActor({ type: "board", source: "session", userId: "u1" }, "admin");
    const res = await request(app).get("/api/openapi.json");
    expect(res.status).toBe(200);
  });
});

