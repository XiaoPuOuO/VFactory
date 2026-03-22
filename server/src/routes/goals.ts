import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { createGoalSchema, updateGoalSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { getGoalProgress, goalService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";

export function goalRoutes(db: Db) {
  const router = Router();
  const svc = goalService(db);

  router.get("/companies/:companyId/goals", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "goals:read");
    const result = await svc.list(companyId);
    res.json(result);
  });

  function parseProgressDateRange(query: Record<string, unknown>) {
    const from = query.from ? new Date(query.from as string) : undefined;
    const to = query.to ? new Date(query.to as string) : undefined;
    return from || to ? { from, to } : undefined;
  }

  router.get("/goals/:goalId/progress", async (req, res) => {
    const goalId = req.params.goalId as string;
    const goal = await svc.getById(goalId);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, goal.companyId, "goals:read");
    const range = parseProgressDateRange(req.query as Record<string, unknown>);
    const progress = await getGoalProgress(db, goalId, range);
    if (!progress) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    res.json(progress);
  });

  router.get("/goals/:id", async (req, res) => {
    const id = req.params.id as string;
    const goal = await svc.getById(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, goal.companyId, "goals:read");
    res.json(goal);
  });

  router.post("/companies/:companyId/goals", validate(createGoalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot create goals" });
      return;
    }
    const goal = await svc.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.created",
      entityType: "goal",
      entityId: goal.id,
      details: { title: goal.title },
    });
    res.status(201).json(goal);
  });

  router.patch("/goals/:id", validate(updateGoalSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot update goals" });
      return;
    }
    const goal = await svc.update(id, req.body);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.updated",
      entityType: "goal",
      entityId: goal.id,
      details: req.body,
    });

    res.json(goal);
  });

  router.delete("/goals/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete goals" });
      return;
    }
    const goal = await svc.remove(id);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: goal.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "goal.deleted",
      entityType: "goal",
      entityId: goal.id,
    });

    res.json(goal);
  });

  return router;
}
