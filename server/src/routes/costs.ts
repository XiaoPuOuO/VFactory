import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createBudgetPolicySchema,
  createCostEventSchema,
  updateBudgetPolicySchema,
  updateBudgetSchema,
  updateCompanyLimitsSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  budgetPolicyService,
  costService,
  companyService,
  agentService,
  logActivity,
} from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";

export function costRoutes(db: Db) {
  const router = Router();
  const costs = costService(db);
  const companies = companyService(db);
  const agents = agentService(db);
  const budgetPolicies = budgetPolicyService(db);

  router.post("/companies/:companyId/cost-events", validate(createCostEventSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);

    if (req.actor.type === "agent" && req.actor.agentId !== req.body.agentId) {
      res.status(403).json({ error: "Agent can only report its own costs" });
      return;
    }

    const event = await costs.createEvent(companyId, {
      ...req.body,
      occurredAt: new Date(req.body.occurredAt),
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "cost.reported",
      entityType: "cost_event",
      entityId: event.id,
      details: { costCents: event.costCents, model: event.model },
    });

    res.status(201).json(event);
  });

  function parseDateRange(query: Record<string, unknown>) {
    const from = query.from ? new Date(query.from as string) : undefined;
    const to = query.to ? new Date(query.to as string) : undefined;
    return (from || to) ? { from, to } : undefined;
  }

  router.get("/companies/:companyId/costs/summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const range = parseDateRange(req.query);
    const summary = await costs.summary(companyId, range);
    res.json(summary);
  });

  router.get("/companies/:companyId/costs/by-agent", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const range = parseDateRange(req.query);
    const rows = await costs.byAgent(companyId, range);
    res.json(rows);
  });

  router.get("/companies/:companyId/costs/by-project", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const range = parseDateRange(req.query);
    const rows = await costs.byProject(companyId, range);
    res.json(rows);
  });

  router.get("/companies/:companyId/costs/by-billing-code", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const range = parseDateRange(req.query);
    const rows = await costs.byBillingCode(companyId, range);
    res.json(rows);
  });

  router.get("/companies/:companyId/costs/by-request-depth", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const range = parseDateRange(req.query);
    const rows = await costs.byRequestDepth(companyId, range);
    res.json(rows);
  });

  router.patch("/companies/:companyId/budgets", validate(updateBudgetSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(db, req, companyId, "budgets:manage");
    const company = await companies.update(companyId, { budgetMonthlyCents: req.body.budgetMonthlyCents });
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.budget_updated",
      entityType: "company",
      entityId: companyId,
      details: { budgetMonthlyCents: req.body.budgetMonthlyCents },
    });

    res.json(company);
  });

  router.patch(
    "/companies/:companyId/limits",
    validate(updateCompanyLimitsSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "budgets:manage");
      const payload: { tokenLimit?: number | null; priceLimitCents?: number | null } = {};
      if (Object.prototype.hasOwnProperty.call(req.body, "tokenLimit")) {
        payload.tokenLimit = req.body.tokenLimit;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, "priceLimitCents")) {
        payload.priceLimitCents = req.body.priceLimitCents;
      }
      if (Object.keys(payload).length === 0) {
        res.status(400).json({ error: "Provide at least one of tokenLimit or priceLimitCents" });
        return;
      }
      const company = await companies.update(companyId, payload);
      if (!company) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.limits_updated",
        entityType: "company",
        entityId: companyId,
        details: payload,
      });
      res.json(company);
    },
  );

  router.get("/companies/:companyId/budget-policies", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const rows = await budgetPolicies.list(companyId);
    res.json(rows);
  });

  router.post(
    "/companies/:companyId/budget-policies",
    validate(createBudgetPolicySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "budgets:manage");
      const row = await budgetPolicies.create(companyId, req.body);
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.budget_policy_created",
        entityType: "budget_policy",
        entityId: row.id,
        details: {
          scopeType: row.scopeType,
          projectId: row.projectId,
          billingCode: row.billingCode,
          limitCents: row.limitCents,
        },
      });
      res.status(201).json(row);
    },
  );

  router.patch(
    "/companies/:companyId/budget-policies/:policyId",
    validate(updateBudgetPolicySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      const policyId = req.params.policyId as string;
      await assertCompanyPermission(db, req, companyId, "budgets:manage");
      const row = await budgetPolicies.update(companyId, policyId, req.body);
      if (!row) {
        res.status(404).json({ error: "Budget policy not found" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "company.budget_policy_updated",
        entityType: "budget_policy",
        entityId: policyId,
        details: req.body,
      });
      res.json(row);
    },
  );

  router.delete("/companies/:companyId/budget-policies/:policyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const policyId = req.params.policyId as string;
    await assertCompanyPermission(db, req, companyId, "budgets:manage");
    const ok = await budgetPolicies.delete(companyId, policyId);
    if (!ok) {
      res.status(404).json({ error: "Budget policy not found" });
      return;
    }
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "company.budget_policy_deleted",
      entityType: "budget_policy",
      entityId: policyId,
      details: {},
    });
    res.status(204).send();
  });

  router.patch("/agents/:agentId/budgets", validate(updateBudgetSchema), async (req, res) => {
    const agentId = req.params.agentId as string;
    const agent = await agents.getById(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    if (req.actor.type === "agent") {
      if (req.actor.agentId !== agentId) {
        res.status(403).json({ error: "Agent can only change its own budget" });
        return;
      }
    }

    const updated = await agents.update(agentId, { budgetMonthlyCents: req.body.budgetMonthlyCents });
    if (!updated) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "agent.budget_updated",
      entityType: "agent",
      entityId: updated.id,
      details: { budgetMonthlyCents: updated.budgetMonthlyCents },
    });

    res.json(updated);
  });

  return router;
}
