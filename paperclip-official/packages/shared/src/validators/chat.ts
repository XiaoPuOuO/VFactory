import { z } from "zod";

/** 群組最多 19 位 AI + Board 自己（共 20 人）。 */
export const MAX_GROUP_AGENT_COUNT = 19;

export const createChatRoomSchema = z
  .object({
    type: z.enum(["direct", "group"]),
    agentId: z.string().uuid().optional(),
    agentIds: z.array(z.string().uuid()).min(1).max(MAX_GROUP_AGENT_COUNT).optional(),
    name: z.string().trim().nullable().optional(),
    /** 僅 direct：建立後待使用者第一則訊息觸發輕量標題生成（不經完整 heartbeat）。 */
    autoSessionTitle: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.autoSessionTitle === true && data.type !== "direct") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "autoSessionTitle is only valid for type direct",
        path: ["autoSessionTitle"],
      });
    }
  });

export type CreateChatRoom = z.infer<typeof createChatRoomSchema>;

export const addChatMessageSchema = z.object({
  body: z.string().min(1),
  /** 可選：指定此則訊息針對哪個專案討論，AI 會據此理解範圍；不傳或空表示未指定。 */
  projectId: z.string().uuid().nullable().optional(),
});

export type AddChatMessage = z.infer<typeof addChatMessageSchema>;

/** PATCH 聊天室：更新輸入區預設專案範圍。 */
export const updateChatRoomSchema = z.object({
  composerProjectId: z.string().uuid().nullable(),
});

export type UpdateChatRoom = z.infer<typeof updateChatRoomSchema>;

/**
 * 更新群組聊天室成員（僅 AI 成員；Board 成員不在此 API 內變更）。
 * - `addAgentIds`：新增成員（UUID）
 * - `removeAgentIds`：移除成員（UUID）
 * 至少需提供其中一個且不為空陣列。
 */
export const updateChatRoomMembersSchema = z.object({
  addAgentIds: z.array(z.string().uuid()).min(1).optional(),
  removeAgentIds: z.array(z.string().uuid()).min(1).optional(),
}).refine((v) => Boolean(v.addAgentIds?.length || v.removeAgentIds?.length), {
  message: "Must provide addAgentIds or removeAgentIds",
});

export type UpdateChatRoomMembers = z.infer<typeof updateChatRoomMembersSchema>;

export const updateChatListPreferencesSchema = z.object({
  notes: z.record(z.string(), z.string()),
  pinned: z.array(z.string()),
});

export type UpdateChatListPreferences = z.infer<typeof updateChatListPreferencesSchema>;
