import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { createOpenApiDocument, registerOpenApiEndpoints } from "../openapi/index.js";

function createApp() {
  const app = express();
  app.use(express.json());

  const api = express.Router();
  api.get("/me", (_req, res) => res.json({ ok: true }));

  const v1 = express.Router();
  v1.get("/sub-me", (_req, res) => res.json({ ok: true }));
  api.use("/v1", v1);

  api.post(
    "/echo",
    validate(
      z.object({
        message: z.string(),
      }),
    ),
    async (req, res) => {
      res.json({ message: (req.body as { message: string }).message });
    },
  );

  app.use("/api", api);

  const openApiDoc = createOpenApiDocument(
    [
      { mountPath: "", router: api },
      { mountPath: "/v1", router: v1 },
    ],
    { apiPrefix: "/api" },
  );
  registerOpenApiEndpoints(api, openApiDoc);

  return app;
}

describe("openapi docs", () => {
  it("serves /api/openapi.json with basic paths", async () => {
    const app = createApp();
    const res = await request(app).get("/api/openapi.json");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");

    const spec = res.body as any;
    expect(spec).toBeTruthy();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths).toBeTruthy();

    expect(spec.paths["/api/me"]).toBeTruthy();
    expect(spec.paths["/api/echo"]).toBeTruthy();
    expect(spec.paths["/api/v1/sub-me"]).toBeTruthy();
    expect(spec.paths["/api/echo"].post.requestBody).toBeTruthy();
  });
});

