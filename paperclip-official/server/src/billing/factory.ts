import type { Db } from "@paperclipai/db";
import type { BillingCheckoutProvider } from "@paperclipai/shared";
import { createEcpayPaymentAdapter } from "./adapters/ecpay-payment-adapter.js";
import { createEcpayInvoiceAdapterFromEnv } from "./adapters/ecpay-invoice-adapter.js";
import { createNoopInvoiceProvider } from "./adapters/noop-invoice.js";
import { createStripePaymentAdapter } from "./adapters/stripe-adapter.js";
import type { InvoiceIssuanceProvider, PaymentProvider } from "./ports.js";

export type BillingFactoryConfig = {
  defaultPaymentProvider: BillingCheckoutProvider;
  defaultInvoiceProvider: "ecpay" | "noop";
  stripeSecretKey: string | null;
  ecpayMerchantId: string | null;
  ecpayHashKey: string | null;
  ecpayHashIv: string | null;
  ecpayActionUrl: string;
  ecpayNotifyUrl: string;
};

export function loadBillingFactoryConfigFromEnv(): BillingFactoryConfig {
  const defaultPayment = (process.env.PAPERCLIP_DEFAULT_PAYMENT_PROVIDER?.trim().toLowerCase() ??
    "stripe") as BillingCheckoutProvider;
  const inv = (process.env.PAPERCLIP_DEFAULT_INVOICE_PROVIDER?.trim().toLowerCase() ?? "ecpay") as
    | "ecpay"
    | "noop";

  return {
    defaultPaymentProvider: defaultPayment === "ecpay" ? "ecpay" : "stripe",
    defaultInvoiceProvider: inv === "noop" ? "noop" : "ecpay",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() ?? null,
    ecpayMerchantId: process.env.PAPERCLIP_ECPAY_MERCHANT_ID?.trim() ?? null,
    ecpayHashKey: process.env.PAPERCLIP_ECPAY_HASH_KEY?.trim() ?? null,
    ecpayHashIv: process.env.PAPERCLIP_ECPAY_HASH_IV?.trim() ?? null,
    ecpayActionUrl:
      process.env.PAPERCLIP_ECPAY_ACTION_URL?.trim() ??
      "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    ecpayNotifyUrl: process.env.PAPERCLIP_ECPAY_NOTIFY_URL?.trim() ?? "",
  };
}

export function createPaymentProvider(db: Db, cfg: BillingFactoryConfig, id: BillingCheckoutProvider): PaymentProvider {
  if (id === "stripe") {
    if (!cfg.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    return createStripePaymentAdapter(db, cfg.stripeSecretKey);
  }
  if (!cfg.ecpayMerchantId || !cfg.ecpayHashKey || !cfg.ecpayHashIv) {
    throw new Error("ECPay MerchantID / HashKey / HashIV are not configured");
  }
  if (!cfg.ecpayNotifyUrl) {
    throw new Error("PAPERCLIP_ECPAY_NOTIFY_URL is required for ECPay");
  }
  return createEcpayPaymentAdapter(db, {
    merchantId: cfg.ecpayMerchantId,
    hashKey: cfg.ecpayHashKey,
    hashIv: cfg.ecpayHashIv,
    actionUrl: cfg.ecpayActionUrl,
    notifyUrl: cfg.ecpayNotifyUrl,
    clientBackUrl: process.env.PAPERCLIP_ECPAY_CLIENT_BACK_URL?.trim() || undefined,
  });
}

export function createInvoiceProvider(cfg: BillingFactoryConfig): InvoiceIssuanceProvider {
  if (cfg.defaultInvoiceProvider === "noop") {
    return createNoopInvoiceProvider();
  }
  return createEcpayInvoiceAdapterFromEnv();
}
