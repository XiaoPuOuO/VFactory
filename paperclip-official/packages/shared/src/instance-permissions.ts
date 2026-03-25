/**
 * Instance 身分組權限註冊表。
 * 單一來源：新增權限時僅需在此註冊並補 i18n，Manager 與 API 會自動暴露。
 */

export type InstancePermissionRegistryEntry = {
  key: string;
  labelKey: string;
  descriptionKey?: string;
  category: "instance" | "company" | "model";
};

/** 佔位用 key，表示 company.create.amount.<數字> 的權限家族；實際儲存為 company.create.amount.N 或 company.create.amount.infinite。 */
export const COMPANY_CREATE_AMOUNT_PLACEHOLDER_KEY = "company.create.amount.{number}";

/** Instance 身分組可設定的權限。* 表示全部權限。 */
export const INSTANCE_PERMISSION_REGISTRY: ReadonlyArray<InstancePermissionRegistryEntry> = [
  { key: "*", labelKey: "instance.permissionKey_all", category: "instance" },
  { key: "admin.setting", labelKey: "instance.permissionKey_admin_setting", category: "instance" },
  { key: "company.view.all", labelKey: "instance.permissionKey_company_view_all", category: "company" },
  { key: COMPANY_CREATE_AMOUNT_PLACEHOLDER_KEY, labelKey: "instance.permissionKey_company_create_amount_number", category: "company" },
  { key: "company.create.amount.infinite", labelKey: "instance.permissionKey_company_create_amount_infinite", category: "company" },
  { key: "model.gemini.local", labelKey: "instance.permissionKey_model_gemini_local", category: "model" },
  { key: "model.gemini.remote", labelKey: "instance.permissionKey_model_gemini_remote", category: "model" },
  { key: "model.claude.local", labelKey: "instance.permissionKey_model_claude_local", category: "model" },
  { key: "model.claude.remote", labelKey: "instance.permissionKey_model_claude_remote", category: "model" },
  { key: "model.codex.local", labelKey: "instance.permissionKey_model_codex_local", category: "model" },
  { key: "model.codex.remote", labelKey: "instance.permissionKey_model_codex_remote", category: "model" },
  { key: "model.cursor.local", labelKey: "instance.permissionKey_model_cursor_local", category: "model" },
  { key: "model.opencode.local", labelKey: "instance.permissionKey_model_opencode_local", category: "model" },
  { key: "model.pi.local", labelKey: "instance.permissionKey_model_pi_local", category: "model" },
  { key: "model.openclaw_gateway", labelKey: "instance.permissionKey_model_openclaw_gateway", category: "model" },
];

/** 固定 key 集合（不含 company.create.amount.{number} 佔位與動態 company.create.amount.N）。 */
const FIXED_INSTANCE_PERMISSION_KEYS = [
  "*",
  "admin.setting",
  "company.view.all",
  "company.create.amount.infinite",
  "model.gemini.local",
  "model.gemini.remote",
  "model.claude.local",
  "model.claude.remote",
  "model.codex.local",
  "model.codex.remote",
  "model.cursor.local",
  "model.opencode.local",
  "model.pi.local",
  "model.openclaw_gateway",
] as const;

/** 是否為合法的 instance 權限 key：固定 key 或 company.create.amount.<正整數>。 */
export function isInstancePermissionKey(key: string): boolean {
  if (FIXED_INSTANCE_PERMISSION_KEYS.includes(key as (typeof FIXED_INSTANCE_PERMISSION_KEYS)[number])) return true;
  return /^company\.create\.amount\.\d+$/.test(key);
}

export type InstancePermissionKey = (typeof FIXED_INSTANCE_PERMISSION_KEYS)[number] | `company.create.amount.${number}`;

/** 供需要列舉的場合使用（不含動態 company.create.amount.N）。 */
export const INSTANCE_PERMISSION_KEYS = FIXED_INSTANCE_PERMISSION_KEYS;
