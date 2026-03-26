import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createGoalSchema, updateGoalSchema } from "@paperclipai/shared";
import { issues } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { conflict } from "../errors.js";
import { getGoalProgress, goalService, issueService, heartbeatService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";
import type { StorageService } from "../storage/types.js";

export function goalRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = goalService(db);
  const heartbeat = heartbeatService(db, storage);
  const issuesSvc = issueService(db);

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

  const refreshGoalNowSchema = z.object({});

  router.post(
    "/goals/:id/refresh-now",
    validate(refreshGoalNowSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }

      await assertCompanyAccess(req, existing.companyId, db);
      if (req.actor.type === "service") {
        res.status(403).json({ error: "Integration token cannot refresh goals" });
        return;
      }

      if (existing.recurrence === "one_time") {
        res.status(400).json({ error: "Only recurring goals can be refreshed manually." });
        return;
      }

      if (existing.status === "cancelled") {
        res.status(409).json({ error: "Cannot refresh a cancelled goal." });
        return;
      }

      // 手動刷新通常應該在「目前週期完成」後進行，避免同一時間產生多個週期的重疊工作。
      const nonTerminalIssueStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;
      const [nonTerminalIssue] = await db
        .select({ id: issues.id })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, existing.companyId),
            eq(issues.goalId, existing.id),
            inArray(issues.status, [...nonTerminalIssueStatuses]),
          ),
        )
        .limit(1);

      if (nonTerminalIssue) {
        throw conflict("Cannot refresh: current goal cycle is not complete.");
      }

      const now = new Date();
      const updatePatch: Record<string, unknown> = {
        recurrenceNextRefreshAt: now,
        ...(existing.status === "achieved" ? { status: "active" } : {}),
      };
      const updatedGoal = await svc.update(id, updatePatch);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: updatedGoal.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "goal.refreshed_now",
        entityType: "goal",
        entityId: updatedGoal.id,
        details: { recurrenceNextRefreshAt: now.toISOString() },
      });

      // 若 goal 指定 owner agent，則立即喚醒該 agent 並（若需要）先建立本週期的 todo issue，
      // 避免 adapter 在無 issue 時自行建立造成額外 run。
      if (updatedGoal.ownerAgentId) {
        const ownerAgentId = updatedGoal.ownerAgentId;

        const [existingAssignedIssue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, updatedGoal.companyId),
              eq(issues.assigneeAgentId, ownerAgentId),
              eq(issues.goalId, updatedGoal.id),
              inArray(issues.status, ["todo", "in_progress", "blocked"]),
            ),
          )
          .limit(1);

        let issueIdForWake: string | null = existingAssignedIssue?.id ?? null;

        if (!issueIdForWake) {
          const created = await issuesSvc.create(updatedGoal.companyId, {
            goalId: updatedGoal.id,
            title: `Goal: ${updatedGoal.title}`,
            description: updatedGoal.description ?? undefined,
            status: "todo",
            priority: "medium",
            assigneeAgentId: ownerAgentId,
          });
          issueIdForWake = created.id;
        }

        await heartbeat.wakeup(ownerAgentId, {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "goal_manual_refresh",
          payload: { issueId: issueIdForWake },
          idempotencyKey: `goal_manual_refresh:${updatedGoal.id}:${now.getTime()}`,
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { goalId: updatedGoal.id },
        });
      }

      res.json(updatedGoal);
    },
  );

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
