import type {
  ChatRoomWithMeta,
  ChatRoomDetail,
  ChatMessage,
  ChatListPreferences,
} from "@paperclipai/shared";

export interface ChatActiveRun {
  id: string;
  status: string;
  agentId: string;
  agentName: string | null;
}
import { api } from "./client";

export const chatApi = {
  listRooms: (companyId: string) =>
    api.get<ChatRoomWithMeta[]>(`/companies/${companyId}/chat/rooms`),

  getListPreferences: (companyId: string) =>
    api.get<ChatListPreferences>(`/companies/${companyId}/chat/list-preferences`),

  saveListPreferences: (companyId: string, prefs: ChatListPreferences) =>
    api.put(`/companies/${companyId}/chat/list-preferences`, prefs),

  /** 不帶 name：取得或建立預設一對一房；帶 name：一律建立新的具名 session。 */
  createDirectRoom: (companyId: string, agentId: string, name?: string | null) =>
    api.post<ChatRoomDetail>(`/companies/${companyId}/chat/rooms`, {
      type: "direct",
      agentId,
      ...(name != null && name !== "" ? { name: name.trim() } : {}),
    }),

  createGroupRoom: (
    companyId: string,
    agentIds: string[],
    name?: string | null,
  ) =>
    api.post<ChatRoomDetail>(`/companies/${companyId}/chat/rooms`, {
      type: "group",
      agentIds,
      name: name ?? null,
    }),

  getRoom: (companyId: string, roomId: string) =>
    api.get<ChatRoomDetail>(`/companies/${companyId}/chat/rooms/${roomId}`),

  getActiveRuns: (companyId: string, roomId: string) =>
    api.get<ChatActiveRun[]>(`/companies/${companyId}/chat/rooms/${roomId}/active-runs`),

  listMessages: (
    companyId: string,
    roomId: string,
    opts?: { limit?: number; before?: string },
  ) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.before) params.set("before", opts.before);
    const qs = params.toString();
    return api.get<ChatMessage[]>(
      `/companies/${companyId}/chat/rooms/${roomId}/messages${qs ? `?${qs}` : ""}`,
    );
  },

  addMessage: (
    companyId: string,
    roomId: string,
    body: string,
    projectId?: string | null,
  ) =>
    api.post<ChatMessage>(
      `/companies/${companyId}/chat/rooms/${roomId}/messages`,
      { body, ...(projectId ? { projectId } : {}) },
    ),

  clearMessages: (companyId: string, roomId: string) =>
    api.delete(`/companies/${companyId}/chat/rooms/${roomId}/messages`),

  deleteRoom: (companyId: string, roomId: string) =>
    api.delete(`/companies/${companyId}/chat/rooms/${roomId}`),
};
