import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { instanceSettings } from "@paperclipai/db";
import { INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH } from "@paperclipai/shared";

/**
 * 此站設定服務：預設公司路徑等鍵值。
 * 未設定 working_directory 的公司，其 Agent 設定目錄將放在 default_company_path/(companyId) 下。
 */
export function instanceSettingsService(db: Db) {
  async function getDefaultCompanyPath(): Promise<string | null> {
    const row = await db
      .select({ value: instanceSettings.value })
      .from(instanceSettings)
      .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH))
      .then((rows) => rows[0] ?? null);
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : null;
  }

  /** 設定預設公司路徑；傳空字串則清除。 */
  async function setDefaultCompanyPath(value: string): Promise<string | null> {
    const normalized = value.trim();
    const now = new Date();
    if (normalized === "") {
      await db
        .delete(instanceSettings)
        .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH));
      return null;
    }
    await db
      .insert(instanceSettings)
      .values({
        key: INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH,
        value: normalized,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.key],
        set: { value: normalized, updatedAt: now },
      });
    return normalized;
  }

  return {
    getDefaultCompanyPath,
    setDefaultCompanyPath,
  };
}
