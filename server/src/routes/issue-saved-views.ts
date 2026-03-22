import { Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueSavedViews } from "@paperclipai/db";
import type { CreateIssueSavedView, UpdateIssueSavedView } from "@paperclipai/shared";
import { createIssueSavedViewSchema, updateIssueSavedViewSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { conflict, notFound } from "../errors.js";

function serializeRow(row: typeof issueSavedViews.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    scopeKey: row.scopeKey,
    name: row.name,
    payload: row.payload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function issueSavedViewRoutes(db: Db) {
  const router = Router();

  router.get("/:companyId/issue-saved-views", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const scopeKey = typeof req.query.scopeKey === "string" ? req.query.scopeKey.trim() : "";
    if (!scopeKey) {
      res.status(400).json({ error: "scopeKey query parameter is required" });
      return;
    }

    const rows = await db
      .select()
      .from(issueSavedViews)
      .where(
        and(
          eq(issueSavedViews.companyId, companyId),
          eq(issueSavedViews.userId, userId),
          eq(issueSavedViews.scopeKey, scopeKey),
        ),
      )
      .orderBy(asc(issueSavedViews.name));

    res.json(rows.map(serializeRow));
  });

  router.post("/:companyId/issue-saved-views", validate(createIssueSavedViewSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as CreateIssueSavedView;
    const actor = getActorInfo(req);

    try {
      const [inserted] = await db
        .insert(issueSavedViews)
        .values({
          companyId,
          userId,
          scopeKey: body.scopeKey,
          name: body.name,
          payload: body.payload,
        })
        .returning();

      if (!inserted) {
        res.status(500).json({ error: "Failed to create saved view" });
        return;
      }

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue_saved_view.created",
        entityType: "issue_saved_view",
        entityId: inserted.id,
        details: { name: inserted.name, scopeKey: inserted.scopeKey },
      });

      res.status(201).json(serializeRow(inserted));
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "23505") {
        throw conflict("A saved view with this name already exists for this scope");
      }
      throw err;
    }
  });

  router.patch("/:companyId/issue-saved-views/:viewId", validate(updateIssueSavedViewSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const viewId = req.params.viewId as string;
    await assertCompanyAccess(req, companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = req.body as UpdateIssueSavedView;
    const actor = getActorInfo(req);

    const existing = await db
      .select()
      .from(issueSavedViews)
      .where(and(eq(issueSavedViews.id, viewId), eq(issueSavedViews.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!existing || existing.userId !== userId) {
      throw notFound("Saved view not found");
    }

    const nextName = body.name ?? existing.name;
    const nextPayload = body.payload ?? existing.payload;

    try {
      const [updated] = await db
        .update(issueSavedViews)
        .set({
          name: nextName,
          payload: nextPayload,
          updatedAt: new Date(),
        })
        .where(and(eq(issueSavedViews.id, viewId), eq(issueSavedViews.companyId, companyId)))
        .returning();

      if (!updated) {
        throw notFound("Saved view not found");
      }

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue_saved_view.updated",
        entityType: "issue_saved_view",
        entityId: updated.id,
        details: { name: updated.name, scopeKey: updated.scopeKey },
      });

      res.json(serializeRow(updated));
    } catch (err: unknown) {
      const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "23505") {
        throw conflict("A saved view with this name already exists for this scope");
      }
      throw err;
    }
  });

  router.delete("/:companyId/issue-saved-views/:viewId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const viewId = req.params.viewId as string;
    await assertCompanyAccess(req, companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const actor = getActorInfo(req);

    const existing = await db
      .select()
      .from(issueSavedViews)
      .where(and(eq(issueSavedViews.id, viewId), eq(issueSavedViews.companyId, companyId)))
      .then((rows) => rows[0] ?? null);

    if (!existing || existing.userId !== userId) {
      throw notFound("Saved view not found");
    }

    await db.delete(issueSavedViews).where(and(eq(issueSavedViews.id, viewId), eq(issueSavedViews.companyId, companyId)));

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue_saved_view.deleted",
      entityType: "issue_saved_view",
      entityId: viewId,
      details: { name: existing.name, scopeKey: existing.scopeKey },
    });

    res.status(204).end();
  });

  return router;
}
