import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createCompanyWebhookEndpointSchema,
  updateCompanyWebhookEndpointSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { companyWebhookService, logActivity } from "../services/index.js";
import { notFound } from "../errors.js";

export function companyWebhookRoutes(db: Db) {
  const router = Router();
  const svc = companyWebhookService(db);

  router.get("/companies/:companyId/webhooks", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const list = await svc.list(companyId);
    res.json(list);
  });

  router.post(
    "/companies/:companyId/webhooks",
    validate(createCompanyWebhookEndpointSchema),
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
        action: "company.webhook_endpoint_created",
        entityType: "company_webhook_endpoint",
        entityId: created.id,
        details: { name: created.name, url: created.url, eventSubscriptions: created.eventSubscriptions },
      });
      res.status(201).json(created);
    },
  );

  router.patch(
    "/companies/:companyId/webhooks/:webhookId",
    validate(updateCompanyWebhookEndpointSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      const webhookId = req.params.webhookId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");

      const result = await svc.update(companyId, webhookId, req.body);
      if (!result) throw notFound("Webhook endpoint not found");

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.webhook_endpoint_updated",
        entityType: "company_webhook_endpoint",
        entityId: result.endpoint.id,
        details: {
          rotatedSecret: Boolean(result.signingSecret),
          name: result.endpoint.name,
          url: result.endpoint.url,
        },
      });

      res.json(
        result.signingSecret
          ? { ...result.endpoint, signingSecret: result.signingSecret }
          : result.endpoint,
      );
    },
  );

  router.delete("/companies/:companyId/webhooks/:webhookId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const webhookId = req.params.webhookId as string;
    await assertCompanyPermission(db, req, companyId, "company:manage");

    const ok = await svc.delete(companyId, webhookId);
    if (!ok) throw notFound("Webhook endpoint not found");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.webhook_endpoint_deleted",
      entityType: "company_webhook_endpoint",
      entityId: webhookId,
      details: {},
    });
    res.status(204).send();
  });

  return router;
}
