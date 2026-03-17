import type { CompanyStatus } from "../constants.js";

export interface Company {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents: boolean;
  brandColor: string | null;
  /** 公司圖示 asset id；若有則外觀顯示上傳圖。 */
  iconAssetId: string | null;
  /** API 回傳：圖示圖片 URL（/api/assets/:id/content），僅在 iconAssetId 有值時存在。 */
  iconContentPath?: string | null;
  /** 公司預設工作目錄（絕對路徑）；儲存後會同步更新該公司下所有 agent 的 cwd。 */
  workingDirectory: string | null;
  /** API 回傳：當 workingDirectory 未設定時，由 instance 預設公司路徑推算出的有效路徑（default_company_path/companyId）。 */
  effectiveWorkingDirectory?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
