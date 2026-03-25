import type { Request, RequestHandler, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { tenants } from "@paperclipai/db";
import { tenantSlugSchema } from "@paperclipai/shared";

export interface TenantResolutionOptions {
  /** 未帶 X-Tenant-* 時使用的預設租戶 slug（例如 "default"） */
  defaultTenantSlug: string;
  /** 當預設租戶不存在時是否自動建立（例如使用者曾刪除 default tenant 時可自癒） */
  createDefaultTenantIfMissing?: boolean;
}

/** 若預設租戶不存在則建立並回傳該筆；已存在則直接回傳。 */
async function ensureDefaultTenant(
  db: Db,
  slug: string,
  createIfMissing: boolean,
): Promise<{ id: string; slug: string } | null> {
  const row = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .then((rows) => rows[0] ?? null);
  if (row) return row;
  if (!createIfMissing) return null;
  const [inserted] = await db
    .insert(tenants)
    .values({ slug, name: slug === "default" ? "Default" : slug, status: "active" })
    .onConflictDoNothing({ target: tenants.slug })
    .returning({ id: tenants.id, slug: tenants.slug });
  if (inserted) return inserted;
  const again = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .then((rows) => rows[0] ?? null);
  return again;
}

/**
 * 從 Header（X-Tenant-ID / X-Tenant-Slug）解析目前請求的租戶，寫入 req.tenantId / req.tenantSlug。
 * 未帶 header 時不設定 tenant（由需要 tenant 的 route 回傳錯誤）；僅當 client 明確送 X-Tenant-Slug 時才解析。
 * 若送的是 defaultTenantSlug 且不存在，可依 createDefaultTenantIfMissing 自動建立。
 */
export function tenantResolutionMiddleware(
  db: Db,
  opts: TenantResolutionOptions,
): RequestHandler {
  const defaultSlug = opts.defaultTenantSlug;
  const createIfMissing = opts.createDefaultTenantIfMissing ?? true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantIdHeader = req.header("x-tenant-id")?.trim();
    const tenantSlugHeader = req.header("x-tenant-slug")?.trim();

    if (tenantIdHeader) {
      const row = await db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantIdHeader))
        .then((rows) => rows[0] ?? null);
      if (row) {
        req.tenantId = row.id;
        req.tenantSlug = row.slug;
        next();
        return;
      }
      res.status(404).json({ error: "Tenant not found", code: "TENANT_NOT_FOUND" });
      return;
    }

    if (tenantSlugHeader) {
      const parsed = tenantSlugSchema.safeParse(tenantSlugHeader);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid X-Tenant-Slug", code: "INVALID_TENANT_SLUG" });
        return;
      }
      const slug = parsed.data;
      const isDefaultSlug = slug === defaultSlug;
      const row = await (isDefaultSlug
        ? ensureDefaultTenant(db, slug, createIfMissing)
        : db
            .select({ id: tenants.id, slug: tenants.slug })
            .from(tenants)
            .where(eq(tenants.slug, slug))
            .then((rows) => rows[0] ?? null));
      if (row) {
        req.tenantId = row.id;
        req.tenantSlug = row.slug;
        next();
        return;
      }
      res.status(404).json({ error: "Tenant not found", code: "TENANT_NOT_FOUND" });
      return;
    }

    // 未帶 tenant header 時不假設 default，由需要 tenant 的 route 回傳錯誤，讓前端導向租戶選擇。
    next();
  };
}
