import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createScheduleSchema,
  updateScheduleSchema,
  listSchedulesQuerySchema,
  scheduleConflictsQuerySchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { scheduleService, heartbeatService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function scheduleRoutes(db: Db) {
  const router = Router();
  const heartbeat = heartbeatService(db as any);
  const svc = scheduleService(db as any, () => heartbeat);

  router.get("/companies/:companyId/schedules/conflicts", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const parsed = scheduleConflictsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { horizonDays, thresholdSec } = parsed.data;
    const conflicts = await svc.listConflicts(companyId, horizonDays, thresholdSec);
    res.json(conflicts);
  });

  router.get("/companies/:companyId/schedules", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const query = listSchedulesQuerySchema.safeParse(req.query);
    const filters =
      query.success
        ? {
            agentId: query.data.agentId,
            enabled:
              query.data.enabled === "true"
                ? true
                : query.data.enabled === "false"
                  ? false
                  : undefined,
          }
        : undefined;
    const result = await svc.list(companyId, filters);
    res.json(result);
  });

  router.get("/companies/:companyId/schedules/:scheduleId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const scheduleId = req.params.scheduleId as string;
    await assertCompanyAccess(req, companyId, db);
    const schedule = await svc.getById(scheduleId, companyId);
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json(schedule);
  });

  router.post("/companies/:companyId/schedules", validate(createScheduleSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const body = req.body as Record<string, unknown>;
    const effectiveAgentId =
      (body.agentId as string | undefined) ??
      (req.actor.type === "agent" ? req.actor.agentId ?? null : null);
    if (!effectiveAgentId) {
      res.status(400).json({ error: "agentId is required, or call as an agent to default to yourself" });
      return;
    }
    const schedule = await svc.create(companyId, {
      agentId: effectiveAgentId,
      name: body.name as string,
      scheduleKind: body.scheduleKind as "cron" | "once" | "ranges",
      timezone: body.timezone as string,
      payload: (body.payload as Record<string, unknown> | null) ?? null,
      enabled: body.enabled as boolean | undefined,
      cronExpression: (body.cronExpression as string | undefined) ?? undefined,
      runAt: (body.runAt as string | undefined) ?? undefined,
      timeOfDay: (body.timeOfDay as string | undefined) ?? undefined,
      windows: (body.windows as Array<{ start: string; end: string }> | undefined) ?? undefined,
    });
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "schedule.created",
      entityType: "schedule",
      entityId: schedule.id,
      details: { name: schedule.name },
    });
    res.status(201).json(schedule);
  });

  router.patch(
    "/companies/:companyId/schedules/:scheduleId",
    validate(updateScheduleSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const scheduleId = req.params.scheduleId as string;
      await assertCompanyAccess(req, companyId, db);
      const existing = await svc.getById(scheduleId, companyId);
      if (!existing) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const schedule = await svc.update(scheduleId, companyId, {
        name: body.name as string | undefined,
        timezone: body.timezone as string | undefined,
        payload: body.payload as Record<string, unknown> | null | undefined,
        enabled: body.enabled as boolean | undefined,
        cronExpression: body.cronExpression as string | null | undefined,
        runAt: body.runAt as string | null | undefined,
        timeOfDay: body.timeOfDay as string | null | undefined,
        windows: body.windows as Array<{ start: string; end: string }> | null | undefined,
      });
      if (!schedule) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "schedule.updated",
        entityType: "schedule",
        entityId: schedule.id,
        details: body,
      });
      res.json(schedule);
    },
  );

  router.delete("/companies/:companyId/schedules/:scheduleId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const scheduleId = req.params.scheduleId as string;
    await assertCompanyAccess(req, companyId, db);
    const schedule = await svc.remove(scheduleId, companyId);
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "schedule.deleted",
      entityType: "schedule",
      entityId: schedule.id,
      details: { name: schedule.name },
    });
    res.json(schedule);
  });

  return router;
}
