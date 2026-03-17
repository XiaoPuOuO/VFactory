import { z } from "zod";

/** 群組最多 19 位 AI + Board 自己（共 20 人）。 */
export const MAX_GROUP_AGENT_COUNT = 19;

export const createChatRoomSchema = z.object({
  type: z.enum(["direct", "group"]),
  agentId: z.string().uuid().optional(),
  agentIds: z.array(z.string().uuid()).min(1).max(MAX_GROUP_AGENT_COUNT).optional(),
  name: z.string().trim().nullable().optional(),
});

export type CreateChatRoom = z.infer<typeof createChatRoomSchema>;

export const addChatMessageSchema = z.object({
  body: z.string().min(1),
  /** 可選：指定此則訊息針對哪個專案討論，AI 會據此理解範圍；不傳或空表示未指定。 */
  projectId: z.string().uuid().nullable().optional(),
});

export type AddChatMessage = z.infer<typeof addChatMessageSchema>;

export const updateChatListPreferencesSchema = z.object({
  notes: z.record(z.string(), z.string()),
  pinned: z.array(z.string()),
});

export type UpdateChatListPreferences = z.infer<typeof updateChatListPreferencesSchema>;
