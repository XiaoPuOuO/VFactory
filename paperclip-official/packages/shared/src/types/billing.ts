/** 方案配額：API 回傳已正規化為 number | null（不含 Token／花費預算，該邏輯在成本頁與後端護欄）。 */
export interface PlanEntitlementsSummary {
  tierKey: string | null;
  billableRunsPerMonth: number | null;
  editorSeatsIncluded: number | null;
  concurrentRuns: number | null;
  webhookDeliveriesPerMonth: number | null;
}

/** API 與 UI 用方案摘要（不含敏感金鑰）。 */
export interface PlanSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  entitlements: PlanEntitlementsSummary;
  intervalDays: number;
  active: boolean;
  sortOrder: number;
}

export interface CompanyBillingStatus {
  subscription: {
    id: string;
    planId: string;
    planSlug: string;
    planName: string;
    paymentProvider: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

/** Instance 設定「方案管理」API 回傳列。 */
export interface InstancePlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  entitlements: Record<string, unknown>;
  externalRefs: Record<string, string>;
  intervalDays: number;
  active: boolean;
  sortOrder: number;
  catalogVisible: boolean;
  allowedCompanyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type BillingCheckoutProvider = "stripe" | "ecpay";

export interface BillingCheckoutRequest {
  planSlug: string;
  currency?: "usd" | "twd";
  paymentProvider?: BillingCheckoutProvider;
  /** 統一發票：載具、愛心碼、買受人統編等（依發票 Adapter 使用）。 */
  invoice?: {
    carrierType?: string;
    carrierNum?: string;
    loveCode?: string;
    buyerIdentifier?: string;
    buyerName?: string;
  };
}
