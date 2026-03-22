import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { scimProvisioningKeys } from "@paperclipai/db";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * SCIM 2.0：驗證 `Authorization: Bearer` 對應 `scim_provisioning_keys`（雜湊），
 * 並設定 `req.tenantId` 為該金鑰所屬租戶。
 */
export function scimBearerAuthMiddleware(db: Db): RequestHandler {
  return async (req, res, next) => {
    const authHeader = req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="SCIM"').json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Missing or invalid Authorization header",
        status: "401",
      });
      return;
    }
    const token = authHeader.slice("bearer ".length).trim();
    if (!token) {
      res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="SCIM"').json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Empty bearer token",
        status: "401",
      });
      return;
    }

    const keyHash = hashToken(token);
    const key = await db
      .select()
      .from(scimProvisioningKeys)
      .where(and(eq(scimProvisioningKeys.keyHash, keyHash), isNull(scimProvisioningKeys.revokedAt)))
      .then((rows) => rows[0] ?? null);

    if (!key) {
      res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="SCIM"').json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        detail: "Invalid provisioning token",
        status: "401",
      });
      return;
    }

    await db
      .update(scimProvisioningKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(scimProvisioningKeys.id, key.id));

    req.tenantId = key.tenantId;
    req.scimProvisioningKeyId = key.id;
    next();
  };
}
