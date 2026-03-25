import { api } from "./client";

export type MeProfile = {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  group: string | null;
  /** Instance 身分組權限鍵；含 "admin.setting" 或 "*" 時可顯示設定按鈕 */
  permissions?: string[];
  /** 是否仍可建立公司（依身分組權限與已擁有數量） */
  canCreateCompany?: boolean;
  /** 是否啟用開發者模式（顯示進階功能如 Agent API 金鑰）。 */
  developerMode?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** 是否有權限看到 instance 設定按鈕（admin.setting 或 admin 的 *） */
export function canAccessInstanceSettings(me: MeProfile | null | undefined): boolean {
  const perms = me?.permissions ?? [];
  return perms.includes("admin.setting") || perms.includes("*");
}

export const meApi = {
  get: () => api.get<MeProfile>("/me"),
  updateDeveloperMode: (developerMode: boolean) =>
    api.patch<{ id: string; developerMode: boolean }>("/me", { developerMode }),
};
