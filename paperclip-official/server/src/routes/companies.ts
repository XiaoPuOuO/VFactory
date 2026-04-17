import { Router } from "express";
import { coerceZeroCompanyLimitsToNull } from "../lib/company-limit-fields.js";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies, companyMemberships, companySubscriptions, tenantMemberships } from "@paperclipai/db";
import {
  companyPortabilityExportSchema,
  companyPortabilityImportSchema,
  companyPortabilityPreviewSchema,
  createAutomationRuleSchema,
  createCompanySchema,
  DEFAULT_OWNER_GRANTS,
  importPoliciesFromCompanySchema,
  updateAutomationRuleSchema,
  updateCompanyManualSubscriptionSchema,
  updateCompanySchema,
  upsertCompanyHireApprovalPolicySchema,
} from "@paperclipai/shared";
import { findPlanById, upsertCompanySubscription } from "../billing/subscription-store.js";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  automationRuleService,
  companyApprovalPolicyService,
  companyPortabilityService,
  companyService,
  costService,
  governanceService,
  logActivity,
} from "../services/index.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { assertBoard, assertCompanyAccess, assertInstanceSetting, getActorInfo, hasCompanyViewAll } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";

export function companyRoutes(db: Db) {
  const router = Router();
  const svc = companyService(db);
  const costs = costService(db);
  const portability = companyPortabilityService(db);
  const access = accessService(db);
  const governance = governanceService(db);
  const approvalPolicies = companyApprovalPolicyService(db);
  const automationRules = automationRuleService(db);

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

  /** 審批與策略中心：待審批、近期已核准之 hire／CEO 策略、issue 關聯計數。 */
  router.get("/:companyId/governance", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const summary = await governance.hub(companyId);
    res.json(summary);
  });

  /** 自動化規則列表（board 可讀）。 */
  router.get("/:companyId/automation-rules", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const rules = await automationRules.list(companyId);
    res.json({ rules });
  });

  router.post("/:companyId/automation-rules", validate(createAutomationRuleSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(db, req, companyId, "governance:policies:manage");
    const row = await automationRules.create(companyId, req.body);
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.automation_rule_created",
      entityType: "automation_rule",
      entityId: row.id,
      details: { name: row.name },
    });
    res.status(201).json(row);
  });

  router.patch(
    "/:companyId/automation-rules/:ruleId",
    validate(updateAutomationRuleSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      const ruleId = req.params.ruleId as string;
      await assertCompanyPermission(db, req, companyId, "governance:policies:manage");
      const row = await automationRules.update(companyId, ruleId, req.body);
      if (!row) {
        res.status(404).json({ error: "Automation rule not found" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.automation_rule_updated",
        entityType: "automation_rule",
        entityId: ruleId,
        details: req.body,
      });
      res.json(row);
    },
  );

  router.delete("/:companyId/automation-rules/:ruleId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const ruleId = req.params.ruleId as string;
    await assertCompanyPermission(db, req, companyId, "governance:policies:manage");
    const ok = await automationRules.delete(companyId, ruleId);
    if (!ok) {
      res.status(404).json({ error: "Automation rule not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.automation_rule_deleted",
      entityType: "automation_rule",
      entityId: ruleId,
    });
    res.json({ ok: true });
  });

  /** 從另一公司複製核准／預算政策。 */
  router.post(
    "/:companyId/policies/import-from",
    validate(importPoliciesFromCompanySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "governance:policies:manage");
      const sourceCompanyId = req.body.sourceCompanyId as string;
      await assertCompanyAccess(req, sourceCompanyId, db);
      const { warnings } = await portability.importPoliciesFromCompany(companyId, sourceCompanyId, {
        replaceExisting: req.body.replaceExisting === true,
      });
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.policies_imported",
        entityType: "company",
        entityId: companyId,
        details: { sourceCompanyId, replaceExisting: req.body.replaceExisting === true },
      });
      res.json({ ok: true, warnings });
    },
  );

  /** 讀取 hire 自動核准政策（租戶內 board 可見）。 */
  router.get("/:companyId/approval-policies/hire", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const row = await approvalPolicies.getForCompany(companyId, "hire_agent");
    res.json(
      row ?? {
        companyId,
        approvalType: "hire_agent",
        enabled: false,
        maxBudgetMonthlyCents: null,
      },
    );
  });

  /** 更新 hire 自動核准政策（需 governance:policies:manage，通常為 owner 或顯式授權）。 */
  router.put(
    "/:companyId/approval-policies/hire",
    validate(upsertCompanyHireApprovalPolicySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "governance:policies:manage");
      const row = await approvalPolicies.upsertHirePolicy(companyId, {
        enabled: req.body.enabled,
        maxBudgetMonthlyCents: req.body.maxBudgetMonthlyCents,
      });
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.approval_policy_updated",
        entityType: "company",
        entityId: companyId,
        details: {
          approvalType: "hire_agent",
          enabled: row.enabled,
          maxBudgetMonthlyCents: row.maxBudgetMonthlyCents,
        },
      });
      res.json(row);
    },
  );

  /**
   * 此站管理員手動指定公司方案與有效期限（含永久）。
   * payment_provider=manual；current_period_end=null 表示永久。
   */
  router.patch(
    "/:companyId/manual-subscription",
    validate(updateCompanyManualSubscriptionSchema),
    async (req, res) => {
      assertBoard(req);
      assertInstanceSetting(req);
      const companyId = req.params.companyId as string;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: "Tenant context required" });
        return;
      }
      const company = await svc.getById(companyId);
      if (!company || company.tenantId !== tenantId) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const rawEnd = req.body.currentPeriodEnd as string | null;
      let periodEnd: Date | null = null;
      if (rawEnd !== null) {
        const d = new Date(rawEnd);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Invalid currentPeriodEnd" });
          return;
        }
        periodEnd = d;
      }
      const plan = await findPlanById(db, req.body.planId as string);
      if (!plan?.active) {
        res.status(400).json({ error: "Invalid or inactive plan" });
        return;
      }
      const existingSub = await db
        .select({ paymentProvider: companySubscriptions.paymentProvider })
        .from(companySubscriptions)
        .where(eq(companySubscriptions.companyId, companyId))
        .then((rows) => rows[0] ?? null);
      if (existingSub && existingSub.paymentProvider !== "manual") {
        res.status(409).json({
          error:
            "此公司已有金流訂閱紀錄（Stripe／綠界），請勿以手動方案覆寫。請使用帳單／客服流程處理，或於資料庫排除該訂閱列後再試。",
          code: "BILLING_SUBSCRIPTION_CONFLICT",
        });
        return;
      }
      await upsertCompanySubscription(db, {
        companyId,
        planId: plan.id,
        paymentProvider: "manual",
        status: "active",
        externalCustomerId: null,
        externalSubscriptionId: null,
        currentPeriodEnd: periodEnd,
        metadata: {
          assignedVia: "instance_company_management",
          updatedAt: new Date().toISOString(),
          updatedByUserId: req.actor.userId ?? null,
        },
      });
      await costs.invalidateBillingRelatedCaches(companyId);
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.manual_subscription_updated",
        entityType: "company",
        entityId: companyId,
        details: {
          planId: plan.id,
          planSlug: plan.slug,
          currentPeriodEnd: periodEnd?.toISOString() ?? null,
        },
      });
      res.json({
        ok: true,
        subscription: {
          planId: plan.id,
          planSlug: plan.slug,
          planName: plan.name,
          currentPeriodEnd: periodEnd?.toISOString() ?? null,
          paymentProvider: "manual",
          status: "active",
        },
      });
    },
  );

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
    await assertCompanyPermission(db, req, companyId, "company:manage");
    const body = req.body as Record<string, unknown>;
    const patchData =
      Object.prototype.hasOwnProperty.call(body, "workingDirectory") && !hasCompanyViewAll(req)
        ? (() => {
            const { workingDirectory: _wd, ...rest } = body;
            return rest;
          })()
        : body;
    const company = await svc.update(companyId, coerceZeroCompanyLimitsToNull(patchData as Record<string, unknown>));
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "tokenLimit") ||
      Object.prototype.hasOwnProperty.call(body, "priceLimitCents")
    ) {
      await costs.invalidateBillingRelatedCaches(companyId);
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
    await assertCompanyPermission(db, req, companyId, "company:manage");
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
    await assertCompanyPermission(db, req, companyId, "company:manage");
    const company = await svc.remove(companyId);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
