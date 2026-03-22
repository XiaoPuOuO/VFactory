import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { dashboardService } from "../services/dashboard.js";
import { assertCompanyAccess } from "./authz.js";

export function dashboardRoutes(db: Db) {
  const router = Router();
  const svc = dashboardService(db);

  router.get("/companies/:companyId/dashboard", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const summary = await svc.summary(companyId);
    res.json(summary);
  });

  router.get("/companies/:companyId/dashboard/trends", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const raw = req.query.days != null ? Number(req.query.days) : 14;
    const days = Number.isFinite(raw) ? raw : 14;
    const trends = await svc.trends(companyId, days);
    res.json(trends);
  });

  return router;
}
