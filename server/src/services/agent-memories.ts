import { eq, and, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentChatMemories, agents } from "@paperclipai/db";
import type { AgentChatMemory } from "@paperclipai/shared";
import { notFound } from "../errors.js";

const DEFAULT_RECENT_LIMIT = 20;

export function agentMemoriesService(db: Db) {
  return {
    /** Agent 寫入一筆跨聊天記憶（僅該 agent 本人呼叫）。 */
    add: async (
      companyId: string,
      agentId: string,
      content: string,
      sourceRoomId?: string | null,
    ): Promise<AgentChatMemory> => {
      const [row] = await db
        .insert(agentChatMemories)
        .values({
          companyId,
          agentId,
          content: content.trim(),
          sourceRoomId: sourceRoomId ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to insert agent chat memory");
      return {
        id: row.id,
        companyId: row.companyId,
        agentId: row.agentId,
        content: row.content,
        sourceRoomId: row.sourceRoomId,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      };
    },

    /** 取該 agent 在此房間的「較早對話摘要」（最近一筆 source_room_id = roomId 的記憶），供 prompt 的 roomEarlierSummary。 */
    getRoomEarlierSummary: async (
      companyId: string,
      agentId: string,
      roomId: string,
    ): Promise<string | null> => {
      const [row] = await db
        .select({ content: agentChatMemories.content })
        .from(agentChatMemories)
        .where(
          and(
            eq(agentChatMemories.companyId, companyId),
            eq(agentChatMemories.agentId, agentId),
            eq(agentChatMemories.sourceRoomId, roomId),
          ),
        )
        .orderBy(desc(agentChatMemories.createdAt))
        .limit(1);
      if (!row || !row.content.trim()) return null;
      return row.content.trim();
    },

    /** 取該 agent 最近 K 筆記憶，供 heartbeat context 組成 crossChatMemorySummary。 */
    getRecentSummary: async (
      companyId: string,
      agentId: string,
      limit: number = DEFAULT_RECENT_LIMIT,
    ): Promise<string | null> => {
      const rows = await db
        .select({ content: agentChatMemories.content })
        .from(agentChatMemories)
        .where(
          and(
            eq(agentChatMemories.companyId, companyId),
            eq(agentChatMemories.agentId, agentId),
          ),
        )
        .orderBy(desc(agentChatMemories.createdAt))
        .limit(limit);
      if (rows.length === 0) return null;
      const lines = rows.reverse().map((r) => r.content.trim()).filter(Boolean);
      return lines.length > 0 ? lines.join("\n") : null;
    },

    /** 列出該 agent 的記憶（board 或 agent 本人檢視用）。 */
    list: async (companyId: string, agentId: string): Promise<AgentChatMemory[]> => {
      const agentRow = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!agentRow) throw notFound("Agent not found");

      const rows = await db
        .select()
        .from(agentChatMemories)
        .where(
          and(
            eq(agentChatMemories.companyId, companyId),
            eq(agentChatMemories.agentId, agentId),
          ),
        )
        .orderBy(desc(agentChatMemories.createdAt));
      return rows.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        agentId: r.agentId,
        content: r.content,
        sourceRoomId: r.sourceRoomId,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }));
    },

    /** 刪除該 agent 的單筆記憶。 */
    deleteOne: async (companyId: string, agentId: string, memoryId: string): Promise<void> => {
      const deleted = await db
        .delete(agentChatMemories)
        .where(
          and(
            eq(agentChatMemories.id, memoryId),
            eq(agentChatMemories.companyId, companyId),
            eq(agentChatMemories.agentId, agentId),
          ),
        )
        .returning({ id: agentChatMemories.id });
      if (deleted.length === 0) throw notFound("Memory not found");
    },

    /** 刪除該 agent 的全部記憶。 */
    deleteAll: async (companyId: string, agentId: string): Promise<void> => {
      await db
        .delete(agentChatMemories)
        .where(
          and(
            eq(agentChatMemories.companyId, companyId),
            eq(agentChatMemories.agentId, agentId),
          ),
        );
    },
  };
}
