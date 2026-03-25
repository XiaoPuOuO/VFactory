import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { scimProvisioningKeys, tenants } from "@paperclipai/db";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertInstanceSetting } from "./authz.js";

const createScimKeySchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function generatePlaintextToken() {
  return `pc_scim_${randomBytes(32).toString("base64url")}`;
}

/**
 * 實例管理員建立 SCIM 佈建 Bearer（僅此處回傳明文一次）。
 */
export function scimProvisioningKeyRoutes(db: Db) {
  const router = Router();

  router.use((req, _res, next) => {
    assertInstanceSetting(req);
    next();
  });

  router.get("/", async (_req, res) => {
    const rows = await db
      .select({
        id: scimProvisioningKeys.id,
        tenantId: scimProvisioningKeys.tenantId,
        name: scimProvisioningKeys.name,
        createdAt: scimProvisioningKeys.createdAt,
        lastUsedAt: scimProvisioningKeys.lastUsedAt,
        revokedAt: scimProvisioningKeys.revokedAt,
      })
      .from(scimProvisioningKeys)
      .orderBy(desc(scimProvisioningKeys.createdAt));
    res.json(rows);
  });

  router.post("/", validate(createScimKeySchema), async (req, res) => {
    const { tenantId, name } = req.body as z.infer<typeof createScimKeySchema>;

    const tenant = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .then((rows) => rows[0] ?? null);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const plaintext = generatePlaintextToken();
    const keyHash = hashToken(plaintext);

    const [row] = await db
      .insert(scimProvisioningKeys)
      .values({
        tenantId,
        name,
        keyHash,
      })
      .returning({
        id: scimProvisioningKeys.id,
        tenantId: scimProvisioningKeys.tenantId,
        name: scimProvisioningKeys.name,
        createdAt: scimProvisioningKeys.createdAt,
      });

    res.status(201).json({
      ...row,
      token: plaintext,
    });
  });

  router.delete("/:keyId", async (req, res) => {
    const keyId = req.params.keyId as string;
    const updated = await db
      .update(scimProvisioningKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(scimProvisioningKeys.id, keyId), isNull(scimProvisioningKeys.revokedAt)))
      .returning({ id: scimProvisioningKeys.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "Key not found" });
      return;
    }
    res.status(204).send();
  });

  return router;
}
