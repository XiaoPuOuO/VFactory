import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { csrfSessionGuard } from "../middleware/csrf-session-guard.js";

function createApp(actor: Express.Request["actor"]) {
  const app = express();
  app.use((req, _res, next) => {
    req.actor = actor;
    next();
  });
  app.use(csrfSessionGuard());
  app.post("/unsafe", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/safe", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("csrfSessionGuard", () => {
  it("blocks unsafe session request without origin headers", async () => {
    const app = createApp({
      type: "board",
      userId: "u1",
      companyIds: [],
      source: "session",
    });
    const res = await request(app).post("/unsafe").set("Host", "localhost:3100");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "CSRF validation failed" });
  });

  it("allows unsafe session request with same origin", async () => {
    const app = createApp({
      type: "board",
      userId: "u1",
      companyIds: [],
      source: "session",
    });
    const res = await request(app)
      .post("/unsafe")
      .set("Host", "localhost:3100")
      .set("Origin", "http://localhost:3100");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("blocks unsafe session request with cross-site origin", async () => {
    const app = createApp({
      type: "board",
      userId: "u1",
      companyIds: [],
      source: "session",
    });
    const res = await request(app)
      .post("/unsafe")
      .set("Host", "localhost:3100")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("does not enforce csrf for non-session actors", async () => {
    const app = createApp({
      type: "agent",
      agentId: "a1",
      companyId: "c1",
      source: "agent_key",
    });
    const res = await request(app).post("/unsafe").set("Host", "localhost:3100");
    expect(res.status).toBe(200);
  });

  it("does not enforce csrf on safe methods", async () => {
    const app = createApp({
      type: "board",
      userId: "u1",
      companyIds: [],
      source: "session",
    });
    const res = await request(app).get("/safe").set("Host", "localhost:3100");
    expect(res.status).toBe(200);
  });
});

