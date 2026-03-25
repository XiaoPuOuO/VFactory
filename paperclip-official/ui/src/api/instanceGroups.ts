import type { InstancePermissionKey } from "@paperclipai/shared";
import { api } from "./client";

export type InstanceGroup = {
  id: string;
  name: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  permissionKeys: string[];
  inheritedGroupIds: string[];
};

/** 權限註冊表單筆（與 GET /instance/groups/permissions 回傳一致） */
export type InstancePermissionRegistryItem = {
  key: string;
  labelKey: string;
  descriptionKey?: string;
  category: string;
};

export const instanceGroupsApi = {
  list: () => api.get<InstanceGroup[]>("/instance/groups"),
  get: (id: string) => api.get<InstanceGroup>(`/instance/groups/${id}`),
  create: (data: { name: string; displayName?: string | null; inheritedGroupIds?: string[] }) =>
    api.post<InstanceGroup>("/instance/groups", data),
  update: (id: string, data: { name?: string; displayName?: string | null; inheritedGroupIds?: string[] }) =>
    api.patch<InstanceGroup>(`/instance/groups/${id}`, data),
  remove: (id: string) => api.delete(`/instance/groups/${id}`),
  /** 取得權限註冊表，供 Manager 與管理權限對話框使用 */
  getPermissionsRegistry: () =>
    api.get<{ permissions: InstancePermissionRegistryItem[] }>("/instance/groups/permissions"),
  getPermissions: (id: string) =>
    api.get<{ permissionKeys: string[] }>(`/instance/groups/${id}/permissions`),
  setPermissions: (id: string, permissionKeys: InstancePermissionKey[]) =>
    api.put<InstanceGroup>(`/instance/groups/${id}/permissions`, { permissionKeys }),
  getDefaultGroup: () =>
    api.get<{ defaultGroupName: string }>("/instance/groups/default-group"),
  setDefaultGroup: (defaultGroupName: string) =>
    api.put<{ defaultGroupName: string }>("/instance/groups/default-group", {
      defaultGroupName,
    }),
};
