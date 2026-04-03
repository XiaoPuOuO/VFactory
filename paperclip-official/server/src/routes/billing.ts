import { Router } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { billingCheckoutSchema, type BillingCheckoutInput } from "@paperclipai/shared";
import { billingFacade } from "../billing/facade.js";
import { loadBillingFactoryConfigFromEnv } from "../billing/factory.js";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

function publicBaseUrl(): string {
  return (process.env.PAPERCLIP_PUBLIC_URL ?? "").replace(/\/$/, "");
}

export function billingRoutes(db: Db) {
  const router = Router();
  const bill = billingFacade(db);
  const cfg = loadBillingFactoryConfigFromEnv();

  router.get("/companies/:companyId/billing/plans", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const plansList = await bill.listSelectablePlansForCompany(companyId);
    res.json({ plans: plansList });
  });

  router.get("/companies/:companyId/billing", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const status = await bill.getCompanyBillingStatus(companyId);
    if (!status) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(status);
  });

  router.post("/companies/:companyId/billing/checkout", validate(billingCheckoutSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const body = req.body as BillingCheckoutInput;

    const base = publicBaseUrl();
    if (!base) {
      res.status(503).json({ error: "PAPERCLIP_PUBLIC_URL is required for checkout redirects" });
      return;
    }

    const [co] = await db
      .select({ issuePrefix: companies.issuePrefix })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!co) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const prefix = co.issuePrefix;
    const tenantSlug = req.tenantSlug ?? "default";
    const successUrl = `${base}/${prefix}/company/billing/return`;
    const cancelUrl = `${base}/${prefix}/company/billing/cancel`;

    const currency = body.currency ?? (body.paymentProvider === "ecpay" || cfg.defaultPaymentProvider === "ecpay" ? "twd" : "usd");
    const paymentProvider = body.paymentProvider ?? cfg.defaultPaymentProvider;

    try {
      const session = await bill.createCheckout({
        companyId,
        tenantSlug,
        planSlug: body.planSlug,
        currency,
        paymentProvider,
        checkout: { ...body, currency, paymentProvider },
        successUrl,
        cancelUrl,
      });
      res.status(200).json(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  router.post("/companies/:companyId/billing/portal", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const base = publicBaseUrl();
    const [co] = await db
      .select({ issuePrefix: companies.issuePrefix })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!co) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const returnUrl =
      typeof req.body?.returnUrl === "string" && req.body.returnUrl.startsWith("http")
        ? req.body.returnUrl
        : `${base}/${co.issuePrefix}/company/billing`;
    try {
      const url = await bill.createPortalUrl(companyId, returnUrl);
      if (!url) {
        res.status(400).json({ error: "Customer portal is only available for Stripe subscriptions with a saved customer" });
        return;
      }
      res.json({ url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
