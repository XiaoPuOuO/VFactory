import { z } from "zod";

/** 預設公司路徑：非管理員建立的公司無法自訂 path，其 Agent 設定目錄將放在此路徑下 (companyId) 子目錄。可為空字串表示未設定。 */
export const setDefaultCompanyPathSchema = z.object({
  defaultCompanyPath: z.string().trim(),
});

export type SetDefaultCompanyPath = z.infer<typeof setDefaultCompanyPathSchema>;
