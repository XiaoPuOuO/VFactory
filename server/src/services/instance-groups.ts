import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  instanceGroupInheritance,
  instanceGroupPermissions,
  instanceGroups,
  instanceSettings,
} from "@paperclipai/db";
import type { InstancePermissionKey } from "@paperclipai/shared";

const DEFAULT_GROUP_KEY = "default_group";

const ADMIN_GROUP_NAME = "admin";

export type InstanceGroupRow = {
  id: string;
  name: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InstanceGroupWithPermissions = InstanceGroupRow & {
  permissionKeys: string[];
  inheritedGroupIds: string[];
};

export function instanceGroupsService(db: Db) {
  /** 取得群組的所有祖先 id（含繼承鏈），用於合併權限與檢測循環。 */
  async function getEffectiveAncestorIds(groupId: string): Promise<Set<string>> {
    const edges = await db
      .select({
        groupId: instanceGroupInheritance.groupId,
        parentGroupId: instanceGroupInheritance.parentGroupId,
      })
      .from(instanceGroupInheritance);
    const childrenToParents = new Map<string, string[]>();
    for (const e of edges) {
      const list = childrenToParents.get(e.groupId) ?? [];
      list.push(e.parentGroupId);
      childrenToParents.set(e.groupId, list);
    }
    const visited = new Set<string>();
    const queue = [groupId];
    visited.add(groupId);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const parents = childrenToParents.get(cur) ?? [];
      for (const p of parents) {
        if (!visited.has(p)) {
          visited.add(p);
          queue.push(p);
        }
      }
    }
    visited.delete(groupId);
    return visited;
  }

  /** 合併本組與所有祖先的權限；若任一等於 * 則回傳 ['*']。 */
  async function getEffectivePermissionKeys(groupId: string): Promise<string[]> {
    const ancestorIds = await getEffectiveAncestorIds(groupId);
    const ownRows = await db
      .select({ permissionKey: instanceGroupPermissions.permissionKey })
      .from(instanceGroupPermissions)
      .where(eq(instanceGroupPermissions.groupId, groupId));
    const ownKeys = ownRows.map((r) => r.permissionKey);
    if (ownKeys.includes("*")) return ["*"];
    const allIds = [groupId, ...ancestorIds];
    const keysSet = new Set<string>(ownKeys);
    for (const aid of ancestorIds) {
      const rows = await db
        .select({ permissionKey: instanceGroupPermissions.permissionKey })
        .from(instanceGroupPermissions)
        .where(eq(instanceGroupPermissions.groupId, aid));
      for (const r of rows) {
        if (r.permissionKey === "*") return ["*"];
        keysSet.add(r.permissionKey);
      }
    }
    return [...keysSet];
  }

  async function getEffectivePermissionKeysByGroupName(groupName: string): Promise<string[]> {
    const group = await db
      .select({ id: instanceGroups.id })
      .from(instanceGroups)
      .where(eq(instanceGroups.name, groupName))
      .then((rows) => rows[0] ?? null);
    if (!group) return [];
    return getEffectivePermissionKeys(group.id);
  }

  async function list(): Promise<InstanceGroupWithPermissions[]> {
    const groups = await db.select().from(instanceGroups).orderBy(instanceGroups.name);
    const [permRows, inheritanceRows] = await Promise.all([
      db.select().from(instanceGroupPermissions),
      db.select().from(instanceGroupInheritance),
    ]);
    const permsByGroup = new Map<string, string[]>();
    for (const p of permRows) {
      const list = permsByGroup.get(p.groupId) ?? [];
      list.push(p.permissionKey);
      permsByGroup.set(p.groupId, list);
    }
    const parentsByGroup = new Map<string, string[]>();
    for (const i of inheritanceRows) {
      const list = parentsByGroup.get(i.groupId) ?? [];
      list.push(i.parentGroupId);
      parentsByGroup.set(i.groupId, list);
    }
    return groups.map((g) => ({
      ...g,
      permissionKeys: permsByGroup.get(g.id) ?? [],
      inheritedGroupIds: parentsByGroup.get(g.id) ?? [],
    }));
  }

  async function getById(id: string): Promise<InstanceGroupWithPermissions | null> {
    const group = await db
      .select()
      .from(instanceGroups)
      .where(eq(instanceGroups.id, id))
      .then((rows) => rows[0] ?? null);
    if (!group) return null;
    const [permRows, inheritanceRows] = await Promise.all([
      db
        .select({ permissionKey: instanceGroupPermissions.permissionKey })
        .from(instanceGroupPermissions)
        .where(eq(instanceGroupPermissions.groupId, id)),
      db
        .select({ parentGroupId: instanceGroupInheritance.parentGroupId })
        .from(instanceGroupInheritance)
        .where(eq(instanceGroupInheritance.groupId, id)),
    ]);
    return {
      ...group,
      permissionKeys: permRows.map((r) => r.permissionKey),
      inheritedGroupIds: inheritanceRows.map((r) => r.parentGroupId),
    };
  }

  async function create(params: {
    name: string;
    displayName?: string | null;
    inheritedGroupIds?: string[];
  }): Promise<InstanceGroupRow & { inheritedGroupIds: string[] }> {
    const name = params.name.trim().toLowerCase();
    const [row] = await db
      .insert(instanceGroups)
      .values({
        name,
        displayName: params.displayName?.trim() || null,
      })
      .returning();
    if (!row) throw new Error("Insert instance group failed");
    const inheritedGroupIds = params.inheritedGroupIds ?? [];
    for (const parentId of inheritedGroupIds) {
      if (parentId === row.id) throw new Error("Group cannot inherit from itself");
      const ancestorsOfParent = await getEffectiveAncestorIds(parentId);
      if (ancestorsOfParent.has(row.id)) {
        throw new Error("Inheritance cycle detected");
      }
    }
    if (inheritedGroupIds.length > 0) {
      const now = new Date();
      await db.insert(instanceGroupInheritance).values(
        inheritedGroupIds.map((parentGroupId) => ({
          groupId: row.id,
          parentGroupId,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    return { ...row, inheritedGroupIds };
  }

  async function update(
    id: string,
    params: { name?: string; displayName?: string | null; inheritedGroupIds?: string[] },
  ): Promise<(InstanceGroupRow & { inheritedGroupIds: string[] }) | null> {
    const existing = await getById(id);
    if (!existing) return null;
    const updates: Partial<{ name: string; displayName: string | null; updatedAt: Date }> = {
      updatedAt: new Date(),
    };
    if (params.name !== undefined) updates.name = params.name.trim().toLowerCase();
    if (params.displayName !== undefined) updates.displayName = params.displayName?.trim() || null;
    const [row] = await db
      .update(instanceGroups)
      .set(updates)
      .where(eq(instanceGroups.id, id))
      .returning();
    if (!row) return null;
    if (params.inheritedGroupIds !== undefined) {
      await db.delete(instanceGroupInheritance).where(eq(instanceGroupInheritance.groupId, id));
      for (const parentId of params.inheritedGroupIds) {
        if (parentId === id) throw new Error("Group cannot inherit from itself");
        const ancestorsOfParent = await getEffectiveAncestorIds(parentId);
        if (ancestorsOfParent.has(id)) {
          throw new Error("Inheritance cycle detected");
        }
      }
      if (params.inheritedGroupIds.length > 0) {
        const now = new Date();
        await db.insert(instanceGroupInheritance).values(
          params.inheritedGroupIds.map((parentGroupId) => ({
            groupId: id,
            parentGroupId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    }
    const updated = await getById(id);
    return updated ? { ...updated } : null;
  }

  /** 不允許刪除名為 admin 的群組。 */
  async function remove(id: string): Promise<boolean> {
    const group = await db
      .select({ name: instanceGroups.name })
      .from(instanceGroups)
      .where(eq(instanceGroups.id, id))
      .then((rows) => rows[0] ?? null);
    if (!group) return false;
    if (group.name === ADMIN_GROUP_NAME) {
      throw new Error("Cannot delete the admin group");
    }
    await db.delete(instanceGroups).where(eq(instanceGroups.id, id));
    return true;
  }

  async function setPermissions(groupId: string, permissionKeys: InstancePermissionKey[]): Promise<void> {
    await db.delete(instanceGroupPermissions).where(eq(instanceGroupPermissions.groupId, groupId));
    if (permissionKeys.length > 0) {
      const now = new Date();
      await db.insert(instanceGroupPermissions).values(
        permissionKeys.map((key) => ({
          groupId,
          permissionKey: key,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  }

  async function getDefaultGroupName(): Promise<string> {
    const row = await db
      .select({ value: instanceSettings.value })
      .from(instanceSettings)
      .where(eq(instanceSettings.key, DEFAULT_GROUP_KEY))
      .then((rows) => rows[0] ?? null);
    return row?.value?.trim() && row.value.trim().length > 0 ? row.value.trim() : "default";
  }

  /** 設定預設群組名稱；name 必須為已存在的 instance_groups.name。 */
  async function setDefaultGroupName(name: string): Promise<string> {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      throw new Error("Default group name cannot be empty");
    }
    const exists = await db
      .select({ id: instanceGroups.id })
      .from(instanceGroups)
      .where(eq(instanceGroups.name, normalized))
      .then((rows) => rows[0] ?? null);
    if (!exists) {
      throw new Error("Group does not exist");
    }
    const now = new Date();
    await db
      .insert(instanceSettings)
      .values({
        key: DEFAULT_GROUP_KEY,
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
    list,
    getById,
    create,
    update,
    remove,
    setPermissions,
    getDefaultGroupName,
    setDefaultGroupName,
    getEffectivePermissionKeysByGroupName,
  };
}
