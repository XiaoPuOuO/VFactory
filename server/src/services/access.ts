import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  companies,
  companyMemberships,
  instanceGroupPermissions,
  instanceGroups,
  principalPermissionGrants,
  tenantMemberships,
  tenants,
} from "@paperclipai/db";
import { companyService } from "./companies.js";
import type { PermissionKey, PrincipalType } from "@paperclipai/shared";
import { ADAPTER_TYPE_TO_MODEL_PERMISSION } from "@paperclipai/shared";

type MembershipRow = typeof companyMemberships.$inferSelect;
type GrantInput = {
  permissionKey: PermissionKey;
  scope?: Record<string, unknown> | null;
};

export function accessService(db: Db) {
  /** 依 user.group 從 instance 身分組解析權限鍵 */
  async function getInstancePermissionsForUser(
    userId: string | null | undefined,
  ): Promise<string[]> {
    if (!userId) return [];
    const userRow = await db
      .select({ group: authUsers.group })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!userRow?.group) return [];
    const rows = await db
      .select({ permissionKey: instanceGroupPermissions.permissionKey })
      .from(instanceGroups)
      .innerJoin(
        instanceGroupPermissions,
        eq(instanceGroups.id, instanceGroupPermissions.groupId),
      )
      .where(eq(instanceGroups.name, userRow.group));
    return rows.map((r) => r.permissionKey);
  }

  /** 使用者是否具備 instance 全權限（身分組含 *） */
  async function hasInstanceFullAccess(userId: string | null | undefined): Promise<boolean> {
    const perms = await getInstancePermissionsForUser(userId);
    return perms.includes("*");
  }

  async function setUserGroup(userId: string, group: string | null): Promise<void> {
    await db.update(authUsers).set({ group, updatedAt: new Date() }).where(eq(authUsers.id, userId));
  }

  /** 列出所有 board 使用者（auth_users），供此站用戶管理使用 */
  async function listBoardUsers(): Promise<
    {
      id: string;
      name: string;
      email: string;
      image: string | null;
      group: string | null;
      createdAt: Date;
      bannedAt: Date | null;
      bannedUntil: Date | null;
      banReason: string | null;
    }[]
  > {
    return db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
        group: authUsers.group,
        createdAt: authUsers.createdAt,
        bannedAt: authUsers.bannedAt,
        bannedUntil: authUsers.bannedUntil,
        banReason: authUsers.banReason,
      })
      .from(authUsers)
      .orderBy(authUsers.createdAt);
  }

  /** 取得使用者封禁狀態；供登入時判斷與 UI 顯示 */
  async function getBanStatus(userId: string): Promise<{
    banned: boolean;
    reason: string | null;
    bannedUntil: Date | null;
  } | null> {
    const row = await db
      .select({
        bannedAt: authUsers.bannedAt,
        bannedUntil: authUsers.bannedUntil,
        banReason: authUsers.banReason,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);
    if (!row) return null;
    if (row.bannedAt == null) return { banned: false, reason: null, bannedUntil: null };
    const now = new Date();
    const permanent = row.bannedUntil == null;
    const stillBanned = permanent || (row.bannedUntil != null && row.bannedUntil > now);
    return {
      banned: stillBanned,
      reason: row.banReason ?? null,
      bannedUntil: row.bannedUntil ?? null,
    };
  }

  /** 封禁帳戶；durationSeconds 為 null 表示永久。封禁後需清除該使用者所有 session。 */
  async function banUser(
    userId: string,
    options: { reason: string; durationSeconds: number | null },
  ): Promise<void> {
    const now = new Date();
    const bannedUntil =
      options.durationSeconds != null && options.durationSeconds > 0
        ? new Date(now.getTime() + options.durationSeconds * 1000)
        : null;
    await db.transaction(async (tx) => {
      await tx
        .update(authUsers)
        .set({
          bannedAt: now,
          bannedUntil,
          banReason: options.reason.trim() || "No reason provided",
          updatedAt: now,
        })
        .where(eq(authUsers.id, userId));
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
    });
  }

  /** 解除封禁 */
  async function unbanUser(userId: string): Promise<void> {
    await db
      .update(authUsers)
      .set({
        bannedAt: null,
        bannedUntil: null,
        banReason: null,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId));
  }

  /** 更新使用者顯示名稱 */
  async function updateUserName(userId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("User name cannot be empty");
    await db
      .update(authUsers)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(authUsers.id, userId));
  }

  /** 刪除帳戶：移除租戶成員資格、刪除僅剩該使用者的租戶（及其公司）、移除公司成員資格、刪除 auth 資料。 */
  async function deleteUser(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const userTenantIds = await tx
        .select({ tenantId: tenantMemberships.tenantId })
        .from(tenantMemberships)
        .where(eq(tenantMemberships.userId, userId));
      const tenantIds = userTenantIds.map((r) => r.tenantId);

      await tx.delete(tenantMemberships).where(eq(tenantMemberships.userId, userId));

      const companySvc = companyService(db);
      for (const tenantId of tenantIds) {
        const remaining = await tx
          .select({ id: tenantMemberships.id })
          .from(tenantMemberships)
          .where(eq(tenantMemberships.tenantId, tenantId))
          .limit(1)
          .then((rows) => rows[0]);
        if (!remaining) {
          const companyIdsInTenant = await tx
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId));
          for (const { id: companyId } of companyIdsInTenant) {
            await companySvc.removeWithinTransaction(tx, companyId);
          }
          await tx.delete(tenants).where(eq(tenants.id, tenantId));
        }
      }

      await tx
        .delete(companyMemberships)
        .where(
          and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
          ),
        );
      await tx.delete(authSessions).where(eq(authSessions.userId, userId));
      await tx.delete(authAccounts).where(eq(authAccounts.userId, userId));
      await tx.delete(authUsers).where(eq(authUsers.id, userId));
    });
  }

  async function getMembership(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
  ): Promise<MembershipRow | null> {
    return db
      .select()
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, principalType),
          eq(companyMemberships.principalId, principalId),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function hasPermission(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    permissionKey: PermissionKey,
  ): Promise<boolean> {
    const membership = await getMembership(companyId, principalType, principalId);
    if (!membership || membership.status !== "active") return false;
    const grant = await db
      .select({ id: principalPermissionGrants.id })
      .from(principalPermissionGrants)
      .where(
        and(
          eq(principalPermissionGrants.companyId, companyId),
          eq(principalPermissionGrants.principalType, principalType),
          eq(principalPermissionGrants.principalId, principalId),
          eq(principalPermissionGrants.permissionKey, permissionKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
    return Boolean(grant);
  }

  async function canUser(
    companyId: string,
    userId: string | null | undefined,
    permissionKey: PermissionKey,
  ): Promise<boolean> {
    if (!userId) return false;
    if (await hasInstanceFullAccess(userId)) return true;
    if (await hasPermission(companyId, "user", userId, permissionKey)) return true;
    // 既有公司建立者可能尚未寫入 grants，依 membershipRole === "owner" 視為擁有全部公司權限
    const membership = await getMembership(companyId, "user", userId);
    return Boolean(membership?.status === "active" && membership.membershipRole === "owner");
  }

  /** 回傳該使用者在該公司內可使用的 adapter 類型（依 model.* 權限）。 */
  async function getAllowedAdapterTypes(
    companyId: string,
    userId: string | null | undefined,
    hasViewAll: boolean,
  ): Promise<string[]> {
    const allTypes = Object.keys(ADAPTER_TYPE_TO_MODEL_PERMISSION);
    if (hasViewAll || !userId) return allTypes;
    const allowed: string[] = [];
    for (const adapterType of allTypes) {
      const perm = ADAPTER_TYPE_TO_MODEL_PERMISSION[adapterType];
      if (perm && (await canUser(companyId, userId, perm))) {
        allowed.push(adapterType);
      }
    }
    return allowed;
  }

  async function listMembers(companyId: string) {
    return db
      .select()
      .from(companyMemberships)
      .where(eq(companyMemberships.companyId, companyId))
      .orderBy(sql`${companyMemberships.createdAt} desc`);
  }

  async function setMemberPermissions(
    companyId: string,
    memberId: string,
    grants: GrantInput[],
    grantedByUserId: string | null,
  ) {
    const member = await db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, companyId), eq(companyMemberships.id, memberId)))
      .then((rows) => rows[0] ?? null);
    if (!member) return null;

    await db.transaction(async (tx) => {
      await tx
        .delete(principalPermissionGrants)
        .where(
          and(
            eq(principalPermissionGrants.companyId, companyId),
            eq(principalPermissionGrants.principalType, member.principalType),
            eq(principalPermissionGrants.principalId, member.principalId),
          ),
        );
      if (grants.length > 0) {
        await tx.insert(principalPermissionGrants).values(
          grants.map((grant) => ({
            companyId,
            principalType: member.principalType,
            principalId: member.principalId,
            permissionKey: grant.permissionKey,
            scope: grant.scope ?? null,
            grantedByUserId,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        );
      }
    });

    return member;
  }

  async function listUserCompanyAccess(userId: string) {
    return db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.principalType, "user"), eq(companyMemberships.principalId, userId)))
      .orderBy(sql`${companyMemberships.createdAt} desc`);
  }

  async function setUserCompanyAccess(userId: string, companyIds: string[]) {
    const existing = await listUserCompanyAccess(userId);
    const existingByCompany = new Map(existing.map((row) => [row.companyId, row]));
    const target = new Set(companyIds);

    await db.transaction(async (tx) => {
      const toDelete = existing.filter((row) => !target.has(row.companyId)).map((row) => row.id);
      if (toDelete.length > 0) {
        await tx.delete(companyMemberships).where(inArray(companyMemberships.id, toDelete));
      }

      for (const companyId of target) {
        if (existingByCompany.has(companyId)) continue;
        await tx.insert(companyMemberships).values({
          companyId,
          principalType: "user",
          principalId: userId,
          status: "active",
          membershipRole: "member",
        });
      }
    });

    return listUserCompanyAccess(userId);
  }

  async function ensureMembership(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    membershipRole: string | null = "member",
    status: "pending" | "active" | "suspended" = "active",
  ) {
    const existing = await getMembership(companyId, principalType, principalId);
    if (existing) {
      if (existing.status !== status || existing.membershipRole !== membershipRole) {
        const updated = await db
          .update(companyMemberships)
          .set({ status, membershipRole, updatedAt: new Date() })
          .where(eq(companyMemberships.id, existing.id))
          .returning()
          .then((rows) => rows[0] ?? null);
        return updated ?? existing;
      }
      return existing;
    }

    return db
      .insert(companyMemberships)
      .values({
        companyId,
        principalType,
        principalId,
        status,
        membershipRole,
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function setPrincipalGrants(
    companyId: string,
    principalType: PrincipalType,
    principalId: string,
    grants: GrantInput[],
    grantedByUserId: string | null,
  ) {
    await db.transaction(async (tx) => {
      await tx
        .delete(principalPermissionGrants)
        .where(
          and(
            eq(principalPermissionGrants.companyId, companyId),
            eq(principalPermissionGrants.principalType, principalType),
            eq(principalPermissionGrants.principalId, principalId),
          ),
        );
      if (grants.length === 0) return;
      await tx.insert(principalPermissionGrants).values(
        grants.map((grant) => ({
          companyId,
          principalType,
          principalId,
          permissionKey: grant.permissionKey,
          scope: grant.scope ?? null,
          grantedByUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    });
  }

  return {
    getInstancePermissionsForUser,
    hasInstanceFullAccess,
    setUserGroup,
    listBoardUsers,
    getBanStatus,
    banUser,
    unbanUser,
    updateUserName,
    deleteUser,
    canUser,
    hasPermission,
    getAllowedAdapterTypes,
    getMembership,
    ensureMembership,
    listMembers,
    setMemberPermissions,
    listUserCompanyAccess,
    setUserCompanyAccess,
    setPrincipalGrants,
  };
}
