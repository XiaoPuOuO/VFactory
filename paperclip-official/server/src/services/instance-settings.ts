import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { instanceSettings } from "@paperclipai/db";
import {
  INSTANCE_SETTING_KEY_BILLING_IGNORE_PLAN_USAGE_CAPS,
  INSTANCE_SETTING_KEY_COMPLIANCE_DEFAULT_RETENTION_DAYS,
  INSTANCE_SETTING_KEY_DEFAULT_COMPANY_PATH,
} from "@paperclipai/shared";

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

  async function getComplianceDefaultRetentionDays(): Promise<number | null> {
    const row = await db
      .select({ value: instanceSettings.value })
      .from(instanceSettings)
      .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_COMPLIANCE_DEFAULT_RETENTION_DAYS))
      .then((rows) => rows[0] ?? null);
    if (!row?.value?.trim()) return null;
    const n = Number.parseInt(row.value.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** 傳 null 清除實例預設留存天數。 */
  async function setComplianceDefaultRetentionDays(value: number | null): Promise<number | null> {
    const now = new Date();
    if (value == null) {
      await db
        .delete(instanceSettings)
        .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_COMPLIANCE_DEFAULT_RETENTION_DAYS));
      return null;
    }
    const str = String(Math.trunc(value));
    await db
      .insert(instanceSettings)
      .values({
        key: INSTANCE_SETTING_KEY_COMPLIANCE_DEFAULT_RETENTION_DAYS,
        value: str,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.key],
        set: { value: str, updatedAt: now },
      });
    return Math.trunc(value);
  }

  /** 為 true 時：resolveCompanyEffectiveLimits 不採用方案之 tokenLimit／priceLimitCents。 */
  async function getBillingIgnorePlanUsageCaps(): Promise<boolean> {
    const row = await db
      .select({ value: instanceSettings.value })
      .from(instanceSettings)
      .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_BILLING_IGNORE_PLAN_USAGE_CAPS))
      .then((rows) => rows[0] ?? null);
    const v = row?.value?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  async function setBillingIgnorePlanUsageCaps(enabled: boolean): Promise<boolean> {
    const now = new Date();
    if (!enabled) {
      await db
        .delete(instanceSettings)
        .where(eq(instanceSettings.key, INSTANCE_SETTING_KEY_BILLING_IGNORE_PLAN_USAGE_CAPS));
      return false;
    }
    await db
      .insert(instanceSettings)
      .values({
        key: INSTANCE_SETTING_KEY_BILLING_IGNORE_PLAN_USAGE_CAPS,
        value: "1",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [instanceSettings.key],
        set: { value: "1", updatedAt: now },
      });
    return true;
  }

  return {
    getDefaultCompanyPath,
    setDefaultCompanyPath,
    getComplianceDefaultRetentionDays,
    setComplianceDefaultRetentionDays,
    getBillingIgnorePlanUsageCaps,
    setBillingIgnorePlanUsageCaps,
  };
}
