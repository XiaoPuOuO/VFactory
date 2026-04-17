import { z } from "zod";

export const billingCheckoutInvoiceSchema = z
  .object({
    carrierType: z.string().max(32).optional(),
    carrierNum: z.string().max(64).optional(),
    loveCode: z.string().max(16).optional(),
    buyerIdentifier: z.string().max(16).optional(),
    buyerName: z.string().max(120).optional(),
  })
  .optional();

export const billingCheckoutSchema = z.object({
  planSlug: z.string().min(1).max(128),
  currency: z.enum(["usd", "twd"]).optional(),
  paymentProvider: z.enum(["stripe", "ecpay"]).optional(),
  invoice: billingCheckoutInvoiceSchema,
});

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;

/** 公司帳單頁直接切換方案（不經金流）。 */
export const billingSwitchPlanSchema = z.object({
  planSlug: z.string().min(1).max(128),
});

export type BillingSwitchPlanInput = z.infer<typeof billingSwitchPlanSchema>;
