import { api } from "./client";

export type InstanceUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  group: string | null;
  createdAt: string;
  bannedAt: string | null;
  bannedUntil: string | null;
  banReason: string | null;
};

/** 是否處於封禁中（有 bannedAt 且未過期或永久） */
export function isUserBanned(user: InstanceUser): boolean {
  if (!user.bannedAt) return false;
  if (!user.bannedUntil) return true;
  return new Date(user.bannedUntil) > new Date();
}

export const instanceUsersApi = {
  list: () => api.get<InstanceUser[]>("/instance/users"),
  setGroup: (userId: string, group: string | null) =>
    api.patch<{ userId: string; group: string | null }>(`/instance/users/${userId}/group`, {
      group,
    }),
  updateName: (userId: string, name: string) =>
    api.patch<{ userId: string; name: string }>(`/instance/users/${userId}/name`, { name }),
  ban: (userId: string, payload: { reason: string; durationSeconds: number | null }) =>
    api.post<{ userId: string; banned: boolean }>(`/instance/users/${userId}/ban`, payload),
  unban: (userId: string) =>
    api.post<{ userId: string; banned: boolean }>(`/instance/users/${userId}/unban`, {}),
  delete: (userId: string) => api.delete(`/instance/users/${userId}`),
};
