import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createCompanyNotificationDestinationSchema,
  testCompanyNotificationDestinationSchema,
  updateCompanyNotificationDestinationSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { logActivity, notificationDestinationService } from "../services/index.js";
import { notFound } from "../errors.js";

export function companyNotificationDestinationRoutes(db: Db) {
  const router = Router();
  const svc = notificationDestinationService(db);

  router.get("/companies/:companyId/notification-destinations", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const list = await svc.list(companyId);
    res.json(list);
  });

  router.post(
    "/companies/:companyId/notification-destinations",
    validate(createCompanyNotificationDestinationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");

      const created = await svc.create(companyId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.notification_destination_created",
        entityType: "company_notification_destination",
        entityId: created.id,
        details: { channel: created.channel, name: created.name },
      });
      res.status(201).json(created);
    },
  );

  router.patch(
    "/companies/:companyId/notification-destinations/:destinationId",
    validate(updateCompanyNotificationDestinationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      const destinationId = req.params.destinationId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");

      const result = await svc.update(companyId, destinationId, req.body);
      if (!result) throw notFound("Notification destination not found");

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.notification_destination_updated",
        entityType: "company_notification_destination",
        entityId: result.id,
        details: { channel: result.channel },
      });
      res.json(result);
    },
  );

  router.delete("/companies/:companyId/notification-destinations/:destinationId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const destinationId = req.params.destinationId as string;
    await assertCompanyPermission(db, req, companyId, "company:manage");

    const ok = await svc.delete(companyId, destinationId);
    if (!ok) throw notFound("Notification destination not found");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.notification_destination_deleted",
      entityType: "company_notification_destination",
      entityId: destinationId,
      details: {},
    });
    res.status(204).send();
  });

  router.post(
    "/companies/:companyId/notification-destinations/test",
    validate(testCompanyNotificationDestinationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");

      const destinationId = req.body.destinationId as string | undefined;
      if (!destinationId) {
        res.status(400).json({ error: "destinationId is required" });
        return;
      }
      const result = await svc.sendTest(companyId, destinationId);
      if (!result.ok) {
        res.status(422).json({ error: result.error });
        return;
      }
      res.json({ ok: true });
    },
  );

  return router;
}
