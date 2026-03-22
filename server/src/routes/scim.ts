import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers, tenantMemberships } from "@paperclipai/db";

function scimUserResource(row: {
  id: string;
  name: string;
  email: string;
  bannedAt: Date | null;
}) {
  const active = row.bannedAt == null;
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    userName: row.email,
    name: { formatted: row.name },
    emails: [{ value: row.email, primary: true }],
    active,
  };
}

function scimError(res: import("express").Response, status: number, detail: string) {
  res.status(status).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail,
    status: String(status),
  });
}

/** 解析 `userName eq "a@b.com"` 形式（僅支援單一 eq）。 */
function parseUserNameEqFilter(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/userName\s+eq\s+"([^"]+)"/i);
  return m ? m[1] : null;
}

export function scimRoutes(db: Db) {
  const router = Router();

  router.get("/ServiceProviderConfig", (_req, res) => {
    res.json({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: "https://github.com/paperclip-ai/paperclip-official",
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [],
    });
  });

  router.get("/Users", async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      scimError(res, 500, "Tenant context missing");
      return;
    }

    const startIndexRaw = req.query.startIndex;
    const countRaw = req.query.count;
    const startIndex =
      typeof startIndexRaw === "string" && startIndexRaw.length > 0
        ? Math.max(1, parseInt(startIndexRaw, 10) || 1)
        : 1;
    const count =
      typeof countRaw === "string" && countRaw.length > 0
        ? Math.min(200, Math.max(1, parseInt(countRaw, 10) || 100))
        : 100;

    const filterEmail = parseUserNameEqFilter(
      typeof req.query.filter === "string" ? req.query.filter : undefined,
    );

    const membershipUserIds = await db
      .select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.tenantId, tenantId));

    const userIds = membershipUserIds.map((r) => r.userId);
    if (userIds.length === 0) {
      res.json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: 0,
        startIndex,
        itemsPerPage: 0,
        Resources: [],
      });
      return;
    }

    const whereList = [inArray(authUsers.id, userIds)];
    if (filterEmail) {
      whereList.push(eq(authUsers.email, filterEmail));
    }

    const allRows = await db
      .select()
      .from(authUsers)
      .where(and(...whereList))
      .orderBy(authUsers.email);

    const totalResults = allRows.length;
    const sliceStart = startIndex - 1;
    const pageRows = allRows.slice(sliceStart, sliceStart + count);

    res.json({
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: pageRows.length,
      Resources: pageRows.map((row) => scimUserResource(row)),
    });
  });

  router.get("/Users/:userId", async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      scimError(res, 500, "Tenant context missing");
      return;
    }
    const userId = req.params.userId as string;

    const membership = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
      .then((rows) => rows[0] ?? null);
    if (!membership) {
      scimError(res, 404, "User not found in tenant");
      return;
    }

    const row = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!row) {
      scimError(res, 404, "User not found");
      return;
    }

    res.json(scimUserResource(row));
  });

  router.post("/Users", async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      scimError(res, 500, "Tenant context missing");
      return;
    }

    const body = req.body as {
      userName?: string;
      name?: { formatted?: string };
      emails?: Array<{ value?: string; primary?: boolean }>;
      active?: boolean;
    };

    const email =
      typeof body.userName === "string" && body.userName.includes("@")
        ? body.userName.trim()
        : body.emails?.find((e) => e?.value?.includes("@"))?.value?.trim() ?? null;

    if (!email) {
      scimError(res, 400, "userName or emails[0].value (email) required");
      return;
    }

    const displayName =
      typeof body.name?.formatted === "string" && body.name.formatted.trim() !== ""
        ? body.name.formatted.trim()
        : email.split("@")[0] ?? "User";

    const existing = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .then((rows) => rows[0] ?? null);

    let userId: string;
    const now = new Date();
    if (existing) {
      userId = existing.id;
      const inTenant = await db
        .select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
        .then((rows) => rows[0] ?? null);
      if (!inTenant) {
        await db.insert(tenantMemberships).values({
          tenantId,
          userId,
          role: "member",
        });
      }
      await db
        .update(authUsers)
        .set({
          name: displayName,
          updatedAt: now,
          bannedAt: body.active === false ? now : null,
          bannedUntil: body.active === false ? null : null,
        })
        .where(eq(authUsers.id, userId));
    } else {
      userId = randomUUID();
      await db.insert(authUsers).values({
        id: userId,
        name: displayName,
        email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tenantMemberships).values({
        tenantId,
        userId,
        role: "member",
      });
    }

    const row = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!row) {
      scimError(res, 500, "Failed to load created user");
      return;
    }

    res.status(201).json(scimUserResource(row));
  });

  router.patch("/Users/:userId", async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      scimError(res, 500, "Tenant context missing");
      return;
    }
    const userId = req.params.userId as string;

    const membership = await db
      .select({ id: tenantMemberships.id })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
      .then((rows) => rows[0] ?? null);
    if (!membership) {
      scimError(res, 404, "User not found in tenant");
      return;
    }

    const body = req.body as {
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
      userName?: string;
      name?: { formatted?: string };
      active?: boolean;
    };

    const row = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!row) {
      scimError(res, 404, "User not found");
      return;
    }

    let name = row.name;
    let email = row.email;
    let bannedAt: Date | null = row.bannedAt;
    let bannedUntil: Date | null = row.bannedUntil;

    if (Array.isArray(body.Operations)) {
      for (const op of body.Operations) {
        if (op.op !== "replace" || !op.path) continue;
        if (op.path === "active") {
          if (op.value === false) {
            bannedAt = new Date();
            bannedUntil = null;
          } else if (op.value === true) {
            bannedAt = null;
            bannedUntil = null;
          }
        }
        if (op.path === "userName" && typeof op.value === "string") {
          email = op.value.trim();
        }
        if (op.path === "name.formatted" && typeof op.value === "string") {
          name = op.value.trim();
        }
      }
    } else {
      if (typeof body.userName === "string") email = body.userName.trim();
      if (typeof body.name?.formatted === "string") name = body.name.formatted.trim();
      if (body.active === false) {
        bannedAt = new Date();
        bannedUntil = null;
      } else if (body.active === true) {
        bannedAt = null;
        bannedUntil = null;
      }
    }

    const now = new Date();
    await db
      .update(authUsers)
      .set({
        name,
        email,
        bannedAt,
        bannedUntil,
        updatedAt: now,
      })
      .where(eq(authUsers.id, userId));

    const updated = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!updated) {
      scimError(res, 500, "User update failed");
      return;
    }

    res.json(scimUserResource(updated));
  });

  router.delete("/Users/:userId", async (req, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      scimError(res, 500, "Tenant context missing");
      return;
    }
    const userId = req.params.userId as string;

    const deleted = await db
      .delete(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.userId, userId)))
      .returning({ id: tenantMemberships.id });

    if (deleted.length === 0) {
      scimError(res, 404, "User not found in tenant");
      return;
    }

    res.status(204).send();
  });

  /** SCIM Groups：宣告不支援，避免 IdP 誤判。 */
  router.all(["/Groups", "/Groups/:id"], (_req, res) => {
    scimError(res, 501, "Groups provisioning is not implemented");
  });

  return router;
}
