import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { roadmapService } from "../services/roadmap.js";
import { logActivity } from "../services/index.js";

const createVersionSchema = z.object({
  title: z.string().min(1).max(500),
  contentMarkdown: z.string().max(500_000).default(""),
});

const createOverrideSchema = z.object({
  patchJson: z.array(z.record(z.unknown())),
});

export function roadmapRoutes(db: Db) {
  const router = Router();
  const svc = roadmapService(db);

  router.get("/companies/:companyId/roadmap/versions", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const rows = await svc.listVersions(companyId);
    res.json({ items: rows });
  });

  router.post("/companies/:companyId/roadmap/versions", validate(createVersionSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const body = req.body as z.infer<typeof createVersionSchema>;
    const actor = getActorInfo(req);
    const userId = req.actor.type === "board" ? req.actor.userId ?? null : null;
    const row = await svc.createVersion(companyId, {
      title: body.title,
      contentMarkdown: body.contentMarkdown,
      createdByUserId: userId,
    });
    if (!row) {
      res.status(500).json({ error: "Failed to create version" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "roadmap.version_created",
      entityType: "roadmap_version",
      entityId: row.id,
      details: { version: row.version, title: row.title },
    });
    res.status(201).json(row);
  });

  router.get("/companies/:companyId/roadmap/overrides", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await svc.listOverrides(companyId, status);
    res.json({ items: rows });
  });

  router.post(
    "/companies/:companyId/roadmap/overrides",
    validate(createOverrideSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCompanyAccess(req, companyId, db);
      const body = req.body as z.infer<typeof createOverrideSchema>;
      const actor = getActorInfo(req);
      const userId = req.actor.type === "board" ? req.actor.userId ?? null : null;
      const row = await svc.createOverride(companyId, {
        patchJson: body.patchJson as unknown[],
        createdByUserId: userId,
      });
      if (!row) {
        res.status(500).json({ error: "Failed to create override" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "roadmap.override_created",
        entityType: "roadmap_human_override",
        entityId: row.id,
        details: { previewHash: row.previewHash },
      });
      res.status(201).json(row);
    },
  );

  router.post("/companies/:companyId/roadmap/overrides/:overrideId/apply", async (req, res) => {
    const companyId = req.params.companyId as string;
    const overrideId = req.params.overrideId as string;
    await assertCompanyAccess(req, companyId, db);
    const actor = getActorInfo(req);
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(403).json({ error: "Only board users may apply overrides" });
      return;
    }
    const updated = await svc.applyOverride(overrideId, companyId, req.actor.userId);
    if (!updated) {
      res.status(404).json({ error: "Override not found or not pending" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "roadmap.override_applied",
      entityType: "roadmap_human_override",
      entityId: updated.id,
      details: {},
    });
    res.json(updated);
  });

  router.post("/companies/:companyId/roadmap/versions/:versionId/materialize", async (req, res) => {
    const companyId = req.params.companyId as string;
    const versionId = req.params.versionId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(403).json({ error: "Only board users may materialize roadmap items" });
      return;
    }
    const result = await svc.materializeVersionToIssues(companyId, versionId);
    if (!result) {
      res.status(404).json({ error: "Roadmap version not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "roadmap.materialized_to_issues",
      entityType: "roadmap_version",
      entityId: versionId,
      details: { createdCount: result.created.length, version: result.version },
    });
    res.status(201).json(result);
  });

  return router;
}
