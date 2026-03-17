import type { Tenant, TenantSummary } from "@paperclipai/shared";
import { api } from "./client";

export const tenantsApi = {
  /** 目前請求的租戶（需已解析；未帶租戶時可能 400） */
  getCurrent: () => api.get<Tenant>("/tenant"),
  /** 目前使用者所屬租戶列表（登入後租戶選擇用） */
  listMine: () => api.get<TenantSummary[]>("/tenants/me"),
};
