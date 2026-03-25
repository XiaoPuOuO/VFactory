/** 租戶狀態 */
export type TenantStatus = "active" | "suspended" | "archived";

/** 租戶內成員角色 */
export type TenantMembershipRole = "owner" | "admin" | "member";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** 目前使用者所屬租戶列表項目（GET /api/tenants/me） */
export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}
