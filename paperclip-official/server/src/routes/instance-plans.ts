import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { plans } from "@paperclipai/db";
import type { CreateInstancePlanInput, InstancePlanRow, UpdateInstancePlanInput } from "@paperclipai/shared";
import { createInstancePlanSchema, updateInstancePlanSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertInstancePricing } from "./authz.js";
import { normalizeAllowedCompanyIds } from "../services/billing/plan-visibility.js";

function toInstancePlanRow(p: typeof plans.$inferSelect): InstancePlanRow {
  const ent =
    p.entitlements && typeof p.entitlements === "object" && !Array.isArray(p.entitlements)
      ? (p.entitlements as Record<string, unknown>)
      : {};
  const rawExt = p.externalRefs;
  const ext =
    rawExt && typeof rawExt === "object" && !Array.isArray(rawExt)
      ? Object.fromEntries(
          Object.entries(rawExt as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? null,
    entitlements: ent,
    externalRefs: ext,
    intervalDays: p.intervalDays,
    active: p.active,
    sortOrder: p.sortOrder,
    catalogVisible: p.catalogVisible,
    allowedCompanyIds: normalizeAllowedCompanyIds(p.allowedCompanyIds),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505");
}

export function instancePlansRoutes(db: Db) {
  const router = Router();

  router.use((req, _res, next) => {
    assertInstancePricing(req);
    next();
  });

  router.get("/", async (_req, res) => {
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.name));
    res.json({ plans: rows.map(toInstancePlanRow) });
  });

  router.post("/", validate(createInstancePlanSchema), async (req, res) => {
    const b = req.body as CreateInstancePlanInput;
    const allowed = normalizeAllowedCompanyIds(b.allowedCompanyIds ?? []);
    try {
      const [row] = await db
        .insert(plans)
        .values({
          slug: b.slug.trim(),
          name: b.name.trim(),
          description: b.description ?? null,
          entitlements: (b.entitlements ?? {}) as typeof plans.$inferInsert.entitlements,
          externalRefs: (b.externalRefs ?? {}) as typeof plans.$inferInsert.externalRefs,
          intervalDays: b.intervalDays ?? 30,
          active: b.active ?? true,
          sortOrder: b.sortOrder ?? 0,
          catalogVisible: b.catalogVisible ?? true,
          allowedCompanyIds: allowed,
        })
        .returning();
      if (!row) {
        res.status(500).json({ error: "Insert failed" });
        return;
      }
      res.status(201).json(toInstancePlanRow(row));
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        res.status(409).json({ error: "Plan slug already exists" });
        return;
      }
      throw err;
    }
  });

  router.patch("/:planId", validate(updateInstancePlanSchema), async (req, res) => {
    const planId = req.params.planId as string;
    const b = req.body as UpdateInstancePlanInput;
    const [existing] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    const patch: Partial<typeof plans.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (b.name !== undefined) patch.name = b.name.trim();
    if (b.description !== undefined) patch.description = b.description;
    if (b.entitlements !== undefined) patch.entitlements = b.entitlements as typeof plans.$inferInsert.entitlements;
    if (b.externalRefs !== undefined) patch.externalRefs = b.externalRefs as typeof plans.$inferInsert.externalRefs;
    if (b.intervalDays !== undefined) patch.intervalDays = b.intervalDays;
    if (b.active !== undefined) patch.active = b.active;
    if (b.sortOrder !== undefined) patch.sortOrder = b.sortOrder;
    if (b.catalogVisible !== undefined) patch.catalogVisible = b.catalogVisible;
    if (b.allowedCompanyIds !== undefined) {
      patch.allowedCompanyIds = normalizeAllowedCompanyIds(b.allowedCompanyIds);
    }

    const [row] = await db.update(plans).set(patch).where(eq(plans.id, planId)).returning();
    if (!row) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    res.json(toInstancePlanRow(row));
  });

  /** 軟刪除：設為停用；已有訂閱列仍保留（onDelete restrict）。 */
  router.delete("/:planId", async (req, res) => {
    const planId = req.params.planId as string;
    const [existing] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    const [row] = await db
      .update(plans)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(plans.id, planId))
      .returning();
    res.json({ plan: row ? toInstancePlanRow(row) : null });
  });

  return router;
}
