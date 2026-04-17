import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { billingRoutes } from "../routes/billing.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      source: "local_implicit",
      userId: "user-1",
      companyIds: ["company-1"],
    };
    next();
  });
  app.use("/api", billingRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("billing self-serve route availability", () => {
  it("returns 403 for self-serve checkout", async () => {
    const res = await request(createApp()).post("/api/companies/company-1/billing/checkout").send({
      planSlug: "team",
      paymentProvider: "stripe",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Self-serve billing is currently disabled");
  });

  it("returns 403 for self-serve plan switching", async () => {
    const res = await request(createApp()).post("/api/companies/company-1/billing/switch-plan").send({
      planSlug: "team",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Self-serve billing is currently disabled");
  });

  it("returns 403 for self-serve billing portal", async () => {
    const res = await request(createApp()).post("/api/companies/company-1/billing/portal").send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Self-serve billing is currently disabled");
  });
});
