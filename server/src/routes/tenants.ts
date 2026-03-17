import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { tenants, tenantMemberships } from "@paperclipai/db";
import { assertBoard } from "./authz.js";

/**
 * 依 userId 產生專屬租戶 slug（[a-z0-9-]+，max 64）。
 * 一帳號一租戶：同一 userId 每次得到相同 slug，避免重複建立。
 */
function slugForUser(userId: string): string {
  const safe = userId.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 62);
  if (safe.length > 0) return `u-${safe}`;
  return `u-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 該使用者的唯一租戶 slug（一 User 一 Tenant 固定對應）。
 */
const canonicalSlugForUser = slugForUser;

/**
 * 確保該使用者擁有唯一租戶（一 User 一 Tenant）；若尚無則建立並設為 owner。
 * 若已有其他租戶（舊資料），只認 slug === canonicalSlugForUser(userId) 的那一個。
 */
async function ensureUserTenant(
  db: Db,
  userId: string,
): Promise<{ id: string; slug: string; name: string }> {
  const canonicalSlug = canonicalSlugForUser(userId);
  const all = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenantMemberships)
    .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
    .where(eq(tenantMemberships.userId, userId));
  const existing = all.find((r) => r.slug === canonicalSlug) ?? all[0] ?? null;
  if (existing?.slug === canonicalSlug) return existing;

  const slug = canonicalSlug;
  const [inserted] = await db
    .insert(tenants)
    .values({ slug, name: "My Workspace", status: "active" })
    .onConflictDoNothing({ target: tenants.slug })
    .returning({ id: tenants.id, slug: tenants.slug, name: tenants.name });

  if (inserted) {
    await db.insert(tenantMemberships).values({
      tenantId: inserted.id,
      userId,
      role: "owner",
    });
    return inserted;
  }

  const row = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .then((rows) => rows[0] ?? null);
  if (row) {
    await db
      .insert(tenantMemberships)
      .values({ tenantId: row.id, userId, role: "owner" })
      .onConflictDoNothing({ target: [tenantMemberships.tenantId, tenantMemberships.userId] });
    return row;
  }
  throw new Error("Failed to ensure user tenant");
}

/**
 * GET /api/tenant — 目前請求的租戶資訊（需已解析出租戶）
 */
export function tenantCurrentRoutes(db: Db) {
  const router = Router();
  router.get("/", async (req, res) => {
    if (!req.tenantId || !req.tenantSlug) {
      res.status(400).json({ error: "Tenant not resolved", code: "TENANT_NOT_RESOLVED" });
      return;
    }
    const row = await db
      .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, req.tenantId))
      .then((rows) => rows[0] ?? null);
    if (!row) {
      res.status(404).json({ error: "Tenant not found", code: "TENANT_NOT_FOUND" });
      return;
    }
    res.json({
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
    });
  });
  return router;
}

/**
 * GET /api/tenants/me — 目前使用者的唯一租戶（一 User 一 Tenant）。
 * 固定回傳一筆：若尚無則自動建立並設為 owner；若有舊資料多筆則只回傳 slug 對應該 user 的那一筆。
 */
export function tenantsMeRoutes(db: Db) {
  const router = Router();
  router.get("/", async (req, res) => {
    assertBoard(req);
    if (!req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const userId = req.actor.userId;
    const tenant = await ensureUserTenant(db, userId);
    res.json([tenant]);
  });
  return router;
}
