import { z } from "zod";

/**
 * 此站管理員為公司手動指定方案與有效期限。
 * currentPeriodEnd 為 null 表示永久有效；為 ISO 8601 字串則為到期日（UTC 儲存）。
 */
export const updateCompanyManualSubscriptionSchema = z
  .object({
    planId: z.string().uuid(),
    currentPeriodEnd: z.union([z.string().min(1), z.null()]),
  })
  .strict();

export type UpdateCompanyManualSubscription = z.infer<typeof updateCompanyManualSubscriptionSchema>;
