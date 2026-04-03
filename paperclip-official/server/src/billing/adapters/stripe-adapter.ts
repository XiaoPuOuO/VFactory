import Stripe from "stripe";
import type { Db } from "@paperclipai/db";
import type { BillingCheckoutProvider } from "@paperclipai/shared";
import type { CheckoutSessionResult, CreateCheckoutInput, PaymentProvider } from "../ports.js";
import { assertPlanSelectableByCompany, findPlanBySlug } from "../subscription-store.js";

export function createStripePaymentAdapter(db: Db, secretKey: string): PaymentProvider {
  const stripe = new Stripe(secretKey);

  return {
    id: "stripe" as BillingCheckoutProvider,

    async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
      const plan = await findPlanBySlug(db, input.planSlug);
      if (!plan) {
        throw new Error("Plan not found or inactive");
      }
      assertPlanSelectableByCompany(plan, input.companyId);
      const priceKey = input.currency === "usd" ? "stripe_price_usd" : "stripe_price_twd";
      const priceId = plan.externalRefs?.[priceKey];
      if (!priceId || !priceId.trim()) {
        throw new Error(`Plan missing external_refs.${priceKey}; configure Stripe Price id on plan`);
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId.trim(), quantity: 1 }],
        success_url: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: input.cancelUrl,
        client_reference_id: input.companyId,
        metadata: {
          companyId: input.companyId,
          planSlug: input.planSlug,
          tenantSlug: input.tenantSlug,
        },
        subscription_data: {
          metadata: {
            companyId: input.companyId,
            planSlug: input.planSlug,
          },
        },
      });
      if (!session.url) {
        throw new Error("Stripe Checkout session missing url");
      }
      return { kind: "stripe_redirect", url: session.url };
    },

    async createCustomerPortalSession(input: {
      externalCustomerId: string;
      returnUrl: string;
    }): Promise<string | null> {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.externalCustomerId,
        return_url: input.returnUrl,
      });
      return session.url;
    },
  };
}

export function constructStripeWebhookEvent(
  stripeSecretKey: string,
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string,
): Stripe.Event {
  const stripe = new Stripe(stripeSecretKey);
  if (!signature) {
    throw new Error("Missing Stripe-Signature header");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
