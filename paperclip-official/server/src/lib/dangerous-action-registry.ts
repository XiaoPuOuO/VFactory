/**
 * 高風險動作登記與 workflow 欄位 `dangerous` 配合使用。
 * API 層未來可擴充：刪除公司、終止 agent、批次 secret 寫入等，一律強制人工審批。
 */
export const DANGEROUS_WORKFLOW_STEP_FLAG = "dangerous" as const;

/** 預留：依 action / route name 擴充伺服器端強制審批清單 */
export const SERVER_DANGEROUS_ACTIONS = [
  "company.delete",
  "agent.terminate",
  "secrets.bulk_rotate",
] as const;

export type ServerDangerousAction = (typeof SERVER_DANGEROUS_ACTIONS)[number];
