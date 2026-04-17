import { z } from "zod";

/** 預設公司路徑：非管理員建立的公司無法自訂 path，其 Agent 設定目錄將放在此路徑下 (companyId) 子目錄。可為空字串表示未設定。 */
export const setDefaultCompanyPathSchema = z.object({
  defaultCompanyPath: z.string().trim(),
});

export type SetDefaultCompanyPath = z.infer<typeof setDefaultCompanyPathSchema>;

/** 實例預設合規留存天數；null 表示未設定（公司繼承語意由前端／營運自行解讀）。 */
export const setComplianceDefaultRetentionSchema = z.object({
  complianceDefaultRetentionDays: z.number().int().min(1).max(3650).nullable(),
});

export type SetComplianceDefaultRetention = z.infer<typeof setComplianceDefaultRetentionSchema>;

/** 為 true 時：忽略方案之 Token／花費配額，僅公司覆寫生效。 */
export const setBillingIgnorePlanUsageCapsSchema = z.object({
  billingIgnorePlanUsageCaps: z.boolean(),
});

export type SetBillingIgnorePlanUsageCaps = z.infer<typeof setBillingIgnorePlanUsageCapsSchema>;
