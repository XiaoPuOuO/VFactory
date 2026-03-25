import type { CompanyStatus } from "../constants.js";
import type { CompanyMaintenanceWindow } from "../maintenance.js";

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
  /** 公司層級 Token 上限（當月累計）；null 表示不限制。 */
  tokenLimit: number | null;
  /** 公司層級花費上限（當月累計，單位：分）；null 表示不限制。 */
  priceLimitCents: number | null;
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
  /**
   * 合規資料留存目標天數；null 表示繼承實例預設（見 instance settings）。
   * 僅政策欄位，不自動刪除資料。
   */
  complianceDataRetentionDays: number | null;
  /** 全域暫停新喚醒直到此時間（UTC）；null 表示未急停。 */
  wakeupsPausedUntil: Date | null;
  wakeupsPausedReason: string | null;
  /** 預排維護區間（UTC ISO start/end）。 */
  maintenanceWindows: CompanyMaintenanceWindow[] | null;
  createdAt: Date;
  updatedAt: Date;
}
