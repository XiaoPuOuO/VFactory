import { asc, eq } from "drizzle-orm";
import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import {
  billingInvoiceAttempts,
  billingWebhookEvents,
  companySubscriptions,
  plans,
} from "@paperclipai/db";
import type { CompanyBillingStatus, PlanEntitlementsSummary, PlanSummary } from "@paperclipai/shared";
import { constructStripeWebhookEvent } from "./adapters/stripe-adapter.js";
import { ecpayVerifyCheckMacValue } from "./ecpay-mac.js";
import {
  createInvoiceProvider,
  createPaymentProvider,
  loadBillingFactoryConfigFromEnv,
  type BillingFactoryConfig,
} from "./factory.js";
import type { CreateCheckoutInput } from "./ports.js";
import { resolveCompanyEffectiveLimits } from "../services/billing/entitlements.js";
import { planSelectableByCompany } from "../services/billing/plan-visibility.js";
import { costService } from "../services/costs.js";
import { logger } from "../middleware/logger.js";
import {
  assertPlanSelectableByCompany,
  findPlanBySlug,
  upsertCompanySubscription,
} from "./subscription-store.js";

function stripeSubscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const s = sub as unknown as { current_period_end?: number; currentPeriodEnd?: number };
  const ts = s.current_period_end ?? s.currentPeriodEnd;
  return ts != null ? new Date(ts * 1000) : null;
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return status;
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "incomplete";
  }
}

function entitlementsNumberField(
  ent: Record<string, unknown>,
  key: string,
): number | null {
  const v = ent[key];
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function entitlementsStringField(ent: Record<string, unknown>, key: string): string | null {
  const v = ent[key];
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() !== "") return v;
  return null;
}

function mapPlanEntitlements(raw: unknown): PlanEntitlementsSummary {
  const ent =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    tierKey: entitlementsStringField(ent, "tierKey"),
    billableRunsPerMonth: entitlementsNumberField(ent, "billableRunsPerMonth"),
    editorSeatsIncluded: entitlementsNumberField(ent, "editorSeatsIncluded"),
    concurrentRuns: entitlementsNumberField(ent, "concurrentRuns"),
    webhookDeliveriesPerMonth: entitlementsNumberField(ent, "webhookDeliveriesPerMonth"),
  };
}

async function claimWebhookEvent(db: Db, provider: string, externalEventId: string): Promise<boolean> {
  const rows = await db
    .insert(billingWebhookEvents)
    .values({ provider, externalEventId })
    .onConflictDoNothing({ target: [billingWebhookEvents.provider, billingWebhookEvents.externalEventId] })
    .returning({ id: billingWebhookEvents.id });
  return rows.length > 0;
}

async function afterSubscriptionMutation(db: Db, companyId: string) {
  await costService(db).invalidateBillingRelatedCaches(companyId);
}

export function billingFacade(db: Db, cfg: BillingFactoryConfig = loadBillingFactoryConfigFromEnv()) {
  const invoiceProvider = createInvoiceProvider(cfg);
  const costs = costService(db);

  return {
    listSelectablePlansForCompany: async (companyId: string): Promise<PlanSummary[]> => {
      const rows = await db
        .select()
        .from(plans)
        .where(eq(plans.active, true))
        .orderBy(asc(plans.sortOrder), asc(plans.name));
      return rows
        .filter((p) => planSelectableByCompany(p, companyId))
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description ?? null,
          entitlements: mapPlanEntitlements(p.entitlements as unknown),
          intervalDays: p.intervalDays,
          active: p.active,
          sortOrder: p.sortOrder,
        }));
    },

    getCompanyBillingStatus: async (companyId: string): Promise<CompanyBillingStatus | null> => {
      const effective = await resolveCompanyEffectiveLimits(db, companyId);
      if (!effective) return null;

      const sub = await db
        .select()
        .from(companySubscriptions)
        .where(eq(companySubscriptions.companyId, companyId))
        .then((r) => r[0] ?? null);

      let planName = "";
      let planSlug = effective.planSlug ?? "free";
      if (sub) {
        const p = await db.select().from(plans).where(eq(plans.id, sub.planId)).then((r) => r[0] ?? null);
        if (p) {
          planName = p.name;
          planSlug = p.slug;
        }
      } else {
        const p = await db
          .select()
          .from(plans)
          .where(eq(plans.slug, planSlug))
          .then((r) => r[0] ?? null);
        planName = p?.name ?? planSlug;
      }

      return {
        subscription: sub
          ? {
              id: sub.id,
              planId: sub.planId,
              planSlug,
              planName,
              paymentProvider: sub.paymentProvider,
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            }
          : null,
      };
    },

    createCheckout: async (input: CreateCheckoutInput) => {
      const providerId = input.paymentProvider ?? cfg.defaultPaymentProvider;
      const payment = createPaymentProvider(db, cfg, providerId);
      return payment.createCheckoutSession(input);
    },

    /**
     * 公司帳單頁「直接切換方案」：不經金流，以 manual 供應商寫入訂閱（開發／內測用）。
     * 正式上線若改回僅限結帳，可移除此端點或改由環境旗標關閉。
     */
    switchPlanWithoutPayment: async (companyId: string, planSlug: string): Promise<void> => {
      const plan = await findPlanBySlug(db, planSlug);
      if (!plan) {
        throw new Error("Plan not found");
      }
      assertPlanSelectableByCompany(plan, companyId);
      await upsertCompanySubscription(db, {
        companyId,
        planId: plan.id,
        paymentProvider: "manual",
        status: "active",
        externalCustomerId: null,
        externalSubscriptionId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        metadata: { source: "company_billing_switch_plan" },
      });
      await afterSubscriptionMutation(db, companyId);
    },

    createPortalUrl: async (companyId: string, returnUrl: string): Promise<string | null> => {
      if (!cfg.stripeSecretKey) return null;
      const sub = await db
        .select()
        .from(companySubscriptions)
        .where(eq(companySubscriptions.companyId, companyId))
        .then((r) => r[0] ?? null);
      const customerId = sub?.externalCustomerId;
      if (!customerId || sub.paymentProvider !== "stripe") {
        return null;
      }
      const stripePay = createPaymentProvider(db, cfg, "stripe");
      if (!stripePay.createCustomerPortalSession) return null;
      return stripePay.createCustomerPortalSession({
        externalCustomerId: customerId,
        returnUrl,
      });
    },

    applyStripeWebhook: async (rawBody: Buffer, signature: string | undefined): Promise<void> => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
      const key = cfg.stripeSecretKey;
      if (!secret || !key) {
        throw new Error("Stripe webhook not configured");
      }
      const event = constructStripeWebhookEvent(key, rawBody, signature, secret);
      const claimed = await claimWebhookEvent(db, "stripe", event.id);
      if (!claimed) {
        return;
      }

      const stripe = new Stripe(key);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") return;
        const companyId = session.metadata?.companyId;
        const planSlug = session.metadata?.planSlug;
        if (!companyId || !planSlug) {
          logger.warn({ sessionId: session.id }, "stripe checkout missing metadata");
          return;
        }
        const plan = await findPlanBySlug(db, planSlug);
        if (!plan) {
          logger.warn({ planSlug }, "stripe checkout plan not found");
          return;
        }
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (!subId) return;
        const subscription = await stripe.subscriptions.retrieve(subId);
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;
        const periodEnd = stripeSubscriptionPeriodEnd(subscription);

        await upsertCompanySubscription(db, {
          companyId,
          planId: plan.id,
          paymentProvider: "stripe",
          status: mapStripeSubscriptionStatus(subscription.status),
          externalCustomerId: customerId,
          externalSubscriptionId: subscription.id,
          currentPeriodEnd: periodEnd,
          metadata: { stripeSubscriptionStatus: subscription.status },
        });
        await afterSubscriptionMutation(db, companyId);

        const item = subscription.items.data[0];
        const unit = item?.price?.unit_amount;
        const amountCents =
          session.amount_total != null && session.amount_total > 0
            ? session.amount_total
            : unit != null
              ? unit
              : 0;
        const inv = await invoiceProvider.issue({
          companyId,
          orderId: session.id,
          amountCents: Math.max(1, amountCents),
          currency: (session.currency ?? "usd").toUpperCase(),
          buyerName: session.customer_details?.name ?? undefined,
          items: [{ name: plan.name, quantity: 1, unitPriceCents: Math.max(1, amountCents) }],
        });
        await db.insert(billingInvoiceAttempts).values({
          companyId,
          invoiceProvider: invoiceProvider.id,
          status: inv.skipped ? "skipped" : inv.ok ? "issued" : "failed",
          requestPayload: { source: "stripe_checkout", sessionId: session.id },
          responsePayload: inv as unknown as Record<string, unknown>,
        });
        return;
      }

      if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        if (!companyId) return;
        const subRow = await db
          .select()
          .from(companySubscriptions)
          .where(eq(companySubscriptions.companyId, companyId))
          .then((r) => r[0] ?? null);
        if (!subRow || subRow.externalSubscriptionId !== subscription.id) {
          return;
        }
        const status =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapStripeSubscriptionStatus(subscription.status);
        const periodEnd = stripeSubscriptionPeriodEnd(subscription);
        await upsertCompanySubscription(db, {
          companyId,
          planId: subRow.planId,
          paymentProvider: "stripe",
          status,
          externalCustomerId: subRow.externalCustomerId,
          externalSubscriptionId: subscription.id,
          currentPeriodEnd: periodEnd,
          metadata: { ...((subRow.metadata as object) ?? {}), stripeSubscriptionStatus: subscription.status },
        });
        await afterSubscriptionMutation(db, companyId);
      }
    },

    /**
     * 處理綠界 NotifyURL。回傳字串應原樣寫入 HTTP body（通常為 `1|OK`）。
     */
    applyEcpayNotify: async (
      params: Record<string, string>,
      hashKey: string,
      hashIv: string,
    ): Promise<string> => {
      if (!ecpayVerifyCheckMacValue(params, hashKey, hashIv)) {
        logger.warn("ecpay notify CheckMacValue failed");
        return "0|CheckMacError";
      }
      const tradeNo = params.MerchantTradeNo ?? "";
      const claimed = await claimWebhookEvent(db, "ecpay", `${tradeNo}:${params.TradeNo ?? tradeNo}`);
      if (!claimed) {
        return "1|OK";
      }

      if (params.RtnCode !== "1") {
        return "1|OK";
      }

      const companyId = params.CustomField1 ?? "";
      const planSlug = params.CustomField2 ?? "";
      if (!companyId || !planSlug) {
        logger.warn({ tradeNo }, "ecpay notify missing CustomField");
        return "1|OK";
      }

      const plan = await findPlanBySlug(db, planSlug);
      if (!plan) {
        logger.warn({ planSlug }, "ecpay notify plan not found");
        return "1|OK";
      }

      const amountTwd = Number(params.TradeAmt ?? params.TotalAmount ?? "0");
      const amountCents = Math.round(amountTwd * 100);
      const periodEnd = new Date();
      periodEnd.setUTCDate(periodEnd.getUTCDate() + (plan.intervalDays > 0 ? plan.intervalDays : 30));

      await upsertCompanySubscription(db, {
        companyId,
        planId: plan.id,
        paymentProvider: "ecpay",
        status: "active",
        externalCustomerId: params.PaymentNo ?? params.TradeNo ?? tradeNo,
        externalSubscriptionId: tradeNo,
        currentPeriodEnd: periodEnd,
        metadata: { ecpayTradeNo: tradeNo, rtnMsg: params.RtnMsg },
      });
      await costs.invalidateBillingRelatedCaches(companyId);

      const inv = await invoiceProvider.issue({
        companyId,
        orderId: tradeNo,
        amountCents: amountCents > 0 ? amountCents : 100,
        currency: "TWD",
        items: [{ name: plan.name, quantity: 1, unitPriceCents: Math.max(1, amountCents) }],
      });
      await db.insert(billingInvoiceAttempts).values({
        companyId,
        invoiceProvider: invoiceProvider.id,
        status: inv.skipped ? "skipped" : inv.ok ? "issued" : "failed",
        responsePayload: inv as unknown as Record<string, unknown>,
      });

      return "1|OK";
    },
  };
}
