import type { BillingCheckoutInput, CompanyBillingStatus, PlanSummary } from "@paperclipai/shared";
import { api } from "./client";

export type CheckoutSessionResponse =
  | { kind: "stripe_redirect"; url: string }
  | { kind: "ecpay_form"; actionUrl: string; fields: Record<string, string> };

export const billingApi = {
  listPlans: (companyId: string) =>
    api.get<{ plans: PlanSummary[] }>(`/companies/${companyId}/billing/plans`),
  getCompanyStatus: (companyId: string) =>
    api.get<CompanyBillingStatus>(`/companies/${companyId}/billing`),
  checkout: (companyId: string, body: BillingCheckoutInput) =>
    api.post<CheckoutSessionResponse>(`/companies/${companyId}/billing/checkout`, body),
  portal: (companyId: string, returnUrl?: string) =>
    api.post<{ url: string }>(`/companies/${companyId}/billing/portal`, returnUrl ? { returnUrl } : {}),
};
