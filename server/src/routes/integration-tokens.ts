import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { integrationApiKeys } from "@paperclipai/db";
import { createIntegrationApiKeySchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/activity-log.js";
import { assertBoard } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function generatePlaintextToken() {
  const raw = randomBytes(32).toString("base64url");
  return `pc_int_${raw}`;
}

export function integrationTokenRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/integration-tokens", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(db, req, companyId, "company:manage");
    const rows = await db
      .select({
        id: integrationApiKeys.id,
        name: integrationApiKeys.name,
        scopes: integrationApiKeys.scopes,
        createdAt: integrationApiKeys.createdAt,
        lastUsedAt: integrationApiKeys.lastUsedAt,
        revokedAt: integrationApiKeys.revokedAt,
      })
      .from(integrationApiKeys)
      .where(eq(integrationApiKeys.companyId, companyId))
      .orderBy(desc(integrationApiKeys.createdAt));
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/integration-tokens",
    validate(createIntegrationApiKeySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");

      const plaintext = generatePlaintextToken();
      const keyHash = hashToken(plaintext);
      const userId = req.actor.userId ?? null;

      const [row] = await db
        .insert(integrationApiKeys)
        .values({
          companyId,
          name: req.body.name,
          keyHash,
          scopes: req.body.scopes,
          createdByUserId: userId,
        })
        .returning({
          id: integrationApiKeys.id,
          name: integrationApiKeys.name,
          scopes: integrationApiKeys.scopes,
          createdAt: integrationApiKeys.createdAt,
        });

      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: userId ?? "board",
        action: "integration_token.created",
        entityType: "integration_api_key",
        entityId: row.id,
        details: { name: row.name },
      });

      res.status(201).json({
        ...row,
        token: plaintext,
      });
    },
  );

  router.delete("/companies/:companyId/integration-tokens/:keyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const keyId = req.params.keyId as string;
    await assertCompanyPermission(db, req, companyId, "company:manage");

    const updated = await db
      .update(integrationApiKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(integrationApiKeys.id, keyId),
          eq(integrationApiKeys.companyId, companyId),
          isNull(integrationApiKeys.revokedAt),
        ),
      )
      .returning({ id: integrationApiKeys.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "integration_token.revoked",
      entityType: "integration_api_key",
      entityId: keyId,
      details: {},
    });

    res.status(204).send();
  });

  return router;
}
