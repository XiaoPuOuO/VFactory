import { Router } from "express";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, companyMemberships, tenantMemberships } from "@paperclipai/db";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createCompanySchema,
  DEFAULT_OWNER_GRANTS,
  updateCompanySchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  companyPortabilityService,
  companyService,
  logActivity,
} from "../services/index.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { assertBoard, assertCompanyAccess, assertInstanceSetting, getActorInfo, hasCompanyViewAll } from "./authz.js";

export function companyRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);

  router.get("/", async (req, res) => {
    if (req.actor.type === "banned") throw forbidden("Account banned");
    assertBoard(req);
    const result = await svc.list(req.tenantId);
    if (hasCompanyViewAll(req)) {
      res.json(result);
      return;
    }
    const allowed = new Set(req.actor.companyIds ?? []);
    res.json(result.filter((company) => allowed.has(company.id)));
  });

  router.get("/stats", async (req, res) => {
    if (req.actor.type === "banned") throw forbidden("Account banned");
    assertBoard(req);
    const allowed = hasCompanyViewAll(req) ? null : new Set(req.actor.companyIds ?? []);
    const stats = await svc.stats(req.tenantId);
    if (!allowed) {
      res.json(stats);
      return;
    }
    const filtered = Object.fromEntries(Object.entries(stats).filter(([companyId]) => allowed.has(companyId)));
    res.json(filtered);
  });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  /** 清理孤兒資料：刪除 company_id 指向已不存在公司的列。需 admin.setting 或 *。 */
  router.post("/cleanup-orphans", async (req, res) => {
    try {
      assertBoard(req);
      assertInstanceSetting(req);
      const result = await svc.cleanupOrphans();
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof Error && "status" in err && typeof (err as { status: number }).status === "number"
        ? (err as { status: number }).status
        : 500;
      return res.status(status).json({ error: message });
    }
  });

  /** 回傳目前使用者在該公司可使用的 adapter 類型（依 model.* 權限）。 */
  router.get("/:companyId/allowed-adapter-types", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const userId = req.actor.userId ?? null;
    const allowed = await access.getAllowedAdapterTypes(
      companyId,
      userId,
      hasCompanyViewAll(req),
    );
    res.json({ adapterTypes: allowed });
  });

  router.get("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const company = await svc.getById(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const defaultPath = await instanceSettingsService(db).getDefaultCompanyPath();
    const effectiveWorkingDirectory =
      company.workingDirectory?.trim() ||
      (defaultPath ? path.join(defaultPath, company.id) : null);
    res.json({ ...company, effectiveWorkingDirectory: effectiveWorkingDirectory ?? undefined });
  });

  router.post("/:companyId/export", validate(companyPortabilityExportSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const result = await portability.exportBundle(companyId, req.body);
    res.json(result);
  });

  router.post("/import/preview", validate(companyPortabilityPreviewSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      await assertCompanyAccess(req, req.body.target.companyId, db);
    } else {
      assertBoard(req);
    }
    const preview = await portability.previewImport(req.body);
    res.json(preview);
  });

  router.post("/import", validate(companyPortabilityImportSchema), async (req, res) => {
    if (req.body.target.mode === "existing_company") {
      await assertCompanyAccess(req, req.body.target.companyId, db);
    } else {
      assertBoard(req);
    }
    const actor = getActorInfo(req);
    const result = await portability.importBundle(
      req.body,
      req.actor.type === "board" ? req.actor.userId : null,
      req.tenantId,
    );
    await logActivity(db, {
      companyId: result.company.id,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: "company.imported",
      entityType: "company",
      entityId: result.company.id,
      agentId: actor.agentId,
      runId: actor.runId,
      details: {
        include: req.body.include ?? null,
        agentCount: result.agents.length,
        warningCount: result.warnings.length,
        companyAction: result.company.action,
      },
    });
    res.json(result);
  });

  router.post("/", validate(createCompanySchema), async (req, res) => {
    if (req.actor.type === "banned") throw forbidden("Account banned");
    assertBoard(req);
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw forbidden("Tenant context required to create company");
    }
    if (!hasCompanyViewAll(req)) {
      const userId = req.actor.userId;
      if (!userId) {
        throw forbidden("User context required to create company");
      }
      const perms = req.actor.permissions ?? [];
      const hasInfinite = perms.includes("company.create.amount.infinite");
      const amountMatch = perms
        .filter((k: string): k is string => /^company\.create\.amount\.\d+$/.test(k))
        .map((k: string) => parseInt(k.replace("company.create.amount.", ""), 10))
        .filter((n: number) => Number.isInteger(n) && n >= 0);
      const limit = hasInfinite ? Infinity : (amountMatch.length > 0 ? Math.max(...amountMatch) : 0);
      if (limit <= 0) {
        throw forbidden("company.create.amount.N or company.create.amount.infinite permission required");
      }
      const ownedCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .innerJoin(
          companyMemberships,
          and(
            eq(companies.id, companyMemberships.companyId),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.membershipRole, "owner"),
            eq(companyMemberships.status, "active"),
          ),
        )
        .where(eq(companies.tenantId, tenantId))
        .then((rows) => rows[0]?.count ?? 0);
      if (limit !== Infinity && ownedCount >= limit) {
        throw forbidden(
          `Company create limit reached (${limit}). You already own ${ownedCount} company(ies) in this tenant.`,
        );
      }
    }
    let company = await svc.create({ ...req.body, tenantId });
    const defaultPath = await instanceSettingsService(db).getDefaultCompanyPath();
    if (defaultPath && !(company.workingDirectory?.trim())) {
      const updated = await svc.update(company.id, {
        workingDirectory: path.join(defaultPath, company.id),
      });
      if (updated) company = updated;
    }
    const creatorUserId = req.actor.userId ?? "local-board";
    await access.ensureMembership(company.id, "user", creatorUserId, "owner", "active");
    await access.setPrincipalGrants(company.id, "user", creatorUserId, [...DEFAULT_OWNER_GRANTS], null);
    await logActivity(db, {
      companyId: company.id,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.created",
      entityType: "company",
      entityId: company.id,
      details: { name: company.name },
    });
    res.status(201).json(company);
  });

  router.patch("/:companyId", validate(updateCompanySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const body = req.body as Record<string, unknown>;
    const patchData =
      Object.prototype.hasOwnProperty.call(body, "workingDirectory") && !hasCompanyViewAll(req)
        ? (() => {
            const { workingDirectory: _wd, ...rest } = body;
            return rest;
          })()
        : body;
    const company = await svc.update(companyId, patchData);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.updated",
      entityType: "company",
      entityId: companyId,
      details: req.body,
    });
    res.json(company);
  });

  router.post("/:companyId/archive", async (req, res) => {
    assertBoard(req);
    assertInstanceSetting(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const company = await svc.archive(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.archived",
      entityType: "company",
      entityId: companyId,
    });
    res.json(company);
  });

  router.delete("/:companyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
