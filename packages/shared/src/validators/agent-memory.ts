import { z } from "zod";

/** Agent 寫入單筆跨聊天記憶 */
export const addAgentMemorySchema = z.object({
  content: z.string().min(1).max(10000),
  /** 可選：標註此記憶來自哪個聊天室（例如房間較早摘要） */
  sourceRoomId: z.string().uuid().nullable().optional(),
});

export type AddAgentMemory = z.infer<typeof addAgentMemorySchema>;
