export interface ChatRoom {
  id: string;
  companyId: string;
  type: "direct" | "group";
  name: string | null;
  /** 聊天室輸入區「針對專案」的持久化選取（同一聊天室再次開啟時還原）。 */
  composerProjectId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatRoomMember {
  id: string;
  roomId: string;
  memberType: "user" | "agent";
  memberId: string;
  joinedAt: string;
  agentName?: string | null;
  agentRole?: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  companyId: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  /** 使用者發送時指定「針對此專案討論」的專案 ID；空表示未指定。 */
  projectId?: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorAgentName?: string | null;
  /** Agent 圖示名稱（對應 Agent.icon，用於 UI 顯示頭像）。 */
  authorAgentIcon?: string | null;
  /** 當訊息由 agent 透過 API 發送且請求帶 X-Paperclip-Run-Id 時寫入，供 adapter 判斷是否已透過工具回覆。 */
  authorRunId?: string | null;
}

export interface ChatRoomWithMeta extends ChatRoom {
  lastMessage: ChatMessage | null;
  members: ChatRoomMember[];
}

export interface ChatRoomDetail {
  room: ChatRoom;
  members: ChatRoomMember[];
}

/** 聊天列表偏好：備註與置頂，GET 回傳 / PUT 寫入用 */
export interface ChatListPreferences {
  notes: Record<string, string>;
  pinned: string[];
}
