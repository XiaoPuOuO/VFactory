import { z } from "zod";
import { COMPANY_STATUSES } from "../constants.js";

export const createCompanySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  workingDirectory: z.string().trim().nullable().optional(),
});

export type CreateCompany = z.infer<typeof createCompanySchema>;

/** 正規化工作目錄路徑以比對重複（trim，空白視為未設定）。 */
export function normalizeWorkingDirectory(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === "" ? null : t;
}

export const updateCompanySchema = createCompanySchema
  .partial()
  .extend({
    status: z.enum(COMPANY_STATUSES).optional(),
    spentMonthlyCents: z.number().int().nonnegative().optional(),
    /** 公司層級 Token 上限（當月累計）；null 或未傳表示不變，傳 0 可視為「清除限制」由實作解讀。 */
    tokenLimit: z.number().int().nonnegative().nullable().optional(),
    /** 公司層級花費上限（當月累計，單位：分）；null 或未傳表示不變。 */
    priceLimitCents: z.number().int().nonnegative().nullable().optional(),
    requireBoardApprovalForNewAgents: z.boolean().optional(),
    brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    /** 公司圖示 asset id；設為 null 則清除圖示。 */
    iconAssetId: z.string().uuid().nullable().optional(),
    workingDirectory: z.string().trim().nullable().optional(),
    /** 僅在變更 workingDirectory 時有效：為 true 時將舊設定目錄內容搬移到新路徑；為 false 或未傳時僅更新路徑不搬移。 */
    moveWorkingDirectory: z.boolean().optional(),
  });

export type UpdateCompany = z.infer<typeof updateCompanySchema>;

/** 僅更新公司層級 Token / Price 上限（Costs 頁面用）。 */
export const updateCompanyLimitsSchema = z.object({
  tokenLimit: z.number().int().nonnegative().nullable().optional(),
  priceLimitCents: z.number().int().nonnegative().nullable().optional(),
});

export type UpdateCompanyLimits = z.infer<typeof updateCompanyLimitsSchema>;
