import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { listApplicationLogs, recordApplicationLog } from "../services/application-logs.js";
import { logActivity } from "../services/index.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  before: z.string().datetime().optional(),
});

const ingestSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  message: z.string().min(1).max(8000),
  context: z.record(z.unknown()).optional(),
});

/**
 * Queryable application/service logs (distinct from activity_log audit stream).
 */
export function serviceLogRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/service-logs", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "activity:read");
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const before = parsed.data.before ? new Date(parsed.data.before) : undefined;
    const rows = await listApplicationLogs(db, {
      companyId,
      limit: parsed.data.limit,
      before,
    });
    res.json({ items: rows });
  });

  router.post(
    "/companies/:companyId/service-logs/ingest",
    validate(ingestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCompanyAccess(req, companyId, db);
      if (req.actor.type !== "service" && req.actor.type !== "agent" && req.actor.type !== "board") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const body = req.body as z.infer<typeof ingestSchema>;
      await recordApplicationLog(db, {
        level: body.level,
        message: body.message,
        context: body.context,
        companyId,
      });
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "service_log.ingested",
        entityType: "company",
        entityId: companyId,
        details: { level: body.level },
      });
      res.status(201).json({ ok: true });
    },
  );

  return router;
}
