/** 單筆 agent 跨聊天記憶（API 讀取／寫入用） */
export interface AgentChatMemory {
  id: string;
  companyId: string;
  agentId: string;
  content: string;
  sourceRoomId: string | null;
  createdAt: string;
}
