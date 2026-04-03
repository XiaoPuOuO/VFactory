import type { BillingCheckoutRequest, BillingCheckoutProvider } from "@paperclipai/shared";

/** 建立結帳工作階段：回傳 Stripe URL 或綠界表單欄位。 */
export type CheckoutSessionResult =
  | { kind: "stripe_redirect"; url: string }
  | {
      kind: "ecpay_form";
      actionUrl: string;
      fields: Record<string, string>;
    };

export interface CreateCheckoutInput {
  companyId: string;
  tenantSlug: string;
  planSlug: string;
  currency: "usd" | "twd";
  paymentProvider: BillingCheckoutProvider;
  checkout: BillingCheckoutRequest;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly id: BillingCheckoutProvider;

  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;

  /** Stripe Customer Portal；不支援時回 null。 */
  createCustomerPortalSession?(input: {
    externalCustomerId: string;
    returnUrl: string;
  }): Promise<string | null>;
}

/** 統一發票開立語意（與特定加值中心解耦）。 */
export interface IssueInvoiceInput {
  companyId: string;
  subscriptionId?: string | null;
  orderId: string;
  amountCents: number;
  currency: string;
  buyerName?: string;
  buyerIdentifier?: string;
  carrierType?: string;
  carrierNum?: string;
  loveCode?: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
}

export interface IssueInvoiceResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  randomCode?: string;
  raw?: Record<string, unknown>;
}

export interface VoidInvoiceInput {
  invoiceNumber: string;
  reason?: string;
}

export interface AllowanceInvoiceInput {
  invoiceNumber: string;
  amountCents: number;
  reason?: string;
}

export interface InvoiceIssuanceProvider {
  readonly id: string;

  issue(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;

  voidInvoice(input: VoidInvoiceInput): Promise<IssueInvoiceResult>;

  allowance(input: AllowanceInvoiceInput): Promise<IssueInvoiceResult>;
}
