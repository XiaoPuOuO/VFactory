import { eq, and, desc, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentChatMemories, agents } from "@paperclipai/db";
import type { AgentChatMemory } from "@paperclipai/shared";
import { notFound } from "../errors.js";

/** 供 crossChatMemorySummary 串接的最近筆數上限（降低 input token）。 */
const DEFAULT_RECENT_LIMIT = 8;
/** 跨房記憶摘要總 token 上限；超出時自最舊段落捨棄。 */
const CROSS_CHAT_SUMMARY_MAX_TOKENS = 1500;
/** 單一房間「較早摘要」token 上限。 */
const ROOM_EARLIER_SUMMARY_MAX_TOKENS = 1500;

function estimateTokenCost(ch: string): number {
  const cp = ch.codePointAt(0);
  if (cp == null) return 0;
  // Rough heuristic: keep it deterministic, fast, and language-aware.
  // - CJK roughly ~2 tokens per character in many tokenizers
  // - ASCII roughly ~0.25 token per character
  if (cp > 0x4e00 && cp < 0x9fff) return 2;
  if (cp < 128) return 0.25;
  return 1;
}

function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += estimateTokenCost(ch);
  }
  return Math.ceil(tokens);
}

function truncateForPrompt(text: string, maxTokens: number): string {
  const t = text.trim();
  if (t.length === 0) return t;
  if (estimateTokens(t) <= maxTokens) return t;

  let tokens = 0;
  let endIdx = 0;
  for (const ch of t) {
    const cost = estimateTokenCost(ch);
    if (tokens + cost > maxTokens) break;
    tokens += cost;
    endIdx += ch.length;
  }
  const sliced = t.slice(0, Math.max(0, endIdx)).trimEnd();
  return sliced.length > 0 ? sliced + "…" : "…";
}

/** 多行記憶自最舊段落捨棄，使總長不超過上限（以 token 估算）。 */
function capMemoryLinesOldestFirst(lines: string[], maxTotalTokens: number): string {
  const filtered = [...lines].filter(Boolean);
  if (filtered.length === 0) return "";

  // Track total token estimate in O(n) instead of repeatedly joining.
  // Newlines are cheap; approximate them as ASCII.
  let totalTokens = filtered.reduce((sum, line) => sum + estimateTokens(line) + 0.25, 0);
  while (totalTokens > maxTotalTokens && filtered.length > 1) {
    totalTokens -= estimateTokens(filtered[0]) + 0.25;
    filtered.shift();
  }

  const acc = filtered.join("\n");
  if (estimateTokens(acc) > maxTotalTokens) {
    return truncateForPrompt(acc, maxTotalTokens);
  }
  return acc.trim();
}

/** 列表 API 預設與最大筆數。 */
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

export interface ListMemoriesOptions {
  q?: string | null;
  sourceRoomId?: string | null;
  limit?: number | null;
}

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
      return truncateForPrompt(row.content, ROOM_EARLIER_SUMMARY_MAX_TOKENS);
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
      if (lines.length === 0) return null;
      return capMemoryLinesOldestFirst(lines, CROSS_CHAT_SUMMARY_MAX_TOKENS);
    },

    /** 列出該 agent 的記憶（board 或 agent 本人檢視用）。支援 q / sourceRoomId / limit 篩選。 */
    list: async (
      companyId: string,
      agentId: string,
      options?: ListMemoriesOptions,
    ): Promise<AgentChatMemory[]> => {
      const agentRow = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((rows) => rows[0] ?? null);
      if (!agentRow) throw notFound("Agent not found");

      const qTrim = options?.q?.trim();
      const sourceRoomId = options?.sourceRoomId?.trim() || null;
      const rawLimit = options?.limit;
      const limit =
        rawLimit != null && Number.isFinite(Number(rawLimit))
          ? Math.min(MAX_LIST_LIMIT, Math.max(1, Number(rawLimit)))
          : DEFAULT_LIST_LIMIT;

      const conditions = [
        eq(agentChatMemories.companyId, companyId),
        eq(agentChatMemories.agentId, agentId),
      ];
      if (qTrim) {
        conditions.push(sql`${agentChatMemories.content} ILIKE ${`%${qTrim}%`}`);
      }
      if (sourceRoomId) {
        conditions.push(eq(agentChatMemories.sourceRoomId, sourceRoomId));
      }

      const rows = await db
        .select()
        .from(agentChatMemories)
        .where(and(...conditions))
        .orderBy(desc(agentChatMemories.createdAt))
        .limit(limit);
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
