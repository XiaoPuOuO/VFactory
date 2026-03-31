import { eq, and, desc, inArray, lt, isNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { chatRooms, chatRoomMembers, chatMessages, chatListPreferences, agents, projects } from "@paperclipai/db";
import {
  MAX_GROUP_AGENT_COUNT,
  type ChatListPreferences,
  type ChatMessage,
  type SkillFrontmatter,
  requiresWorkflowRuntime,
} from "@paperclipai/shared";
import { notFound, forbidden, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { issueService } from "./issues.js";
import { publishLiveEvent } from "./live-events.js";
import { parseSkillInvocations } from "./skill-invocation-parser.js";
import { mergeEveryoneMentionedAgentIds } from "../lib/chat-everyone-mention.js";
import { generateChatSessionTitleFromUserText } from "./chat-session-title.js";
import type { StorageService } from "../storage/types.js";
import { createWorkflowRunService } from "./workflow-run-service.js";
import { loadCompanySkillsForInjection } from "./company-skill-bundle.js";

function normalizeSkillKeyForChat(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Board 在聊天室送出 `/skill` 時，若為多階段工作流程則應建立 workflow run（否則僅有技能注入文字，引擎不會推進）。
 * 與 {@link requiresWorkflowRuntime} 對齊，並補上「多個 prompt 步驟但無 depends_on/output」之情形。
 */
function shouldAutoStartWorkflowRunFromChatInvocation(fm: SkillFrontmatter): boolean {
  if (fm.mode !== "active") return false;
  const flow = fm.flow;
  if (!flow || flow.length === 0) return false;
  if (requiresWorkflowRuntime(fm)) return true;
  return flow.length > 1;
}

async function claimDirectRoomForSessionTitleJob(
  db: Db,
  companyId: string,
  roomId: string,
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [cntRow] = await tx
      .select({ c: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(eq(chatMessages.roomId, roomId), eq(chatMessages.companyId, companyId)));
    if (Number(cntRow?.c) !== 1) return false;
    const [row] = await tx
      .update(chatRooms)
      .set({ awaitingSessionTitle: false, updatedAt: new Date() })
      .where(
        and(
          eq(chatRooms.id, roomId),
          eq(chatRooms.companyId, companyId),
          eq(chatRooms.awaitingSessionTitle, true),
        ),
      )
      .returning({ id: chatRooms.id });
    return Boolean(row);
  });
}

export type ChatActor =
  | { type: "board"; userId: string }
  | { type: "agent"; agentId: string };

export type ChatHeartbeat = {
  wakeup: (agentId: string, opts?: {
    source?: "timer" | "assignment" | "on_demand" | "automation";
    triggerDetail?: string | null;
    reason?: string | null;
    payload?: Record<string, unknown> | null;
    requestedByActorType?: string | null;
    requestedByActorId?: string | null;
    contextSnapshot?: Record<string, unknown> | null;
    /** 同一則聊天訊息對同一 agent 重複喚醒時去重（heartbeat enqueueWakeup 內使用）。 */
    idempotencyKey?: string | null;
  }) => Promise<unknown>;
};

export function chatService(
  db: Db,
  heartbeat: ChatHeartbeat,
  /** 若缺省，聊天訊息不會自動建立 workflow run（測試／無儲存層情境）。 */
  storage?: StorageService | null,
) {
  const issuesSvc = issueService(db);

  async function getRoom(companyId: string, roomId: string) {
    const row = await db
      .select()
      .from(chatRooms)
      .where(and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    return row;
  }

  async function isMember(roomId: string, actor: ChatActor): Promise<boolean> {
    const memberType = actor.type === "board" ? "user" : "agent";
    const memberId = actor.type === "board" ? actor.userId : actor.agentId;
    const row = await db
      .select({ id: chatRoomMembers.id })
      .from(chatRoomMembers)
      .where(
        and(
          eq(chatRoomMembers.roomId, roomId),
          eq(chatRoomMembers.memberType, memberType),
          eq(chatRoomMembers.memberId, memberId),
        ),
      )
      .then((rows) => rows[0] ?? null);
    return !!row;
  }

  const chatSvc = {
    listRooms: async (companyId: string, userId: string) => {
      const memberRows = await db
        .select({ roomId: chatRoomMembers.roomId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.memberType, "user"),
            eq(chatRoomMembers.memberId, userId),
          ),
        );
      const roomIds = memberRows.map((r) => r.roomId);
      if (roomIds.length === 0) return [];

      const rooms = await db
        .select()
        .from(chatRooms)
        .where(and(eq(chatRooms.companyId, companyId), inArray(chatRooms.id, roomIds)));
      const ordered = roomIds.map((id) => rooms.find((r) => r.id === id)).filter(Boolean) as typeof rooms;
      const lastMessages = await Promise.all(
        ordered.map(async (room) => {
          const [msg] = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.roomId, room.id))
            .orderBy(desc(chatMessages.createdAt))
            .limit(1);
          return { roomId: room.id, lastMessage: msg ?? null };
        }),
      );
      const membersByRoom = await db
        .select({
          roomId: chatRoomMembers.roomId,
          memberType: chatRoomMembers.memberType,
          memberId: chatRoomMembers.memberId,
        })
        .from(chatRoomMembers)
        .where(inArray(chatRoomMembers.roomId, roomIds));
      const agentIds = [...new Set(
        membersByRoom.filter((m) => m.memberType === "agent").map((m) => m.memberId),
      )];
      const agentRows =
        agentIds.length > 0
          ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(eq(agents.companyId, companyId))
            .then((rows) => rows.filter((r) => agentIds.includes(r.id)))
          : [];
      const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]));
      return ordered.map((room) => {
        const last = lastMessages.find((m) => m.roomId === room.id)?.lastMessage ?? null;
        const members = membersByRoom.filter((m) => m.roomId === room.id).map((m) => {
          if (m.memberType === "agent") {
            return { ...m, agentName: agentNameById.get(m.memberId) ?? null };
          }
          return { ...m, agentName: null as string | null };
        });
        return { ...room, lastMessage: last, members };
      });
    },

    listRoomsForAgent: async (companyId: string, agentId: string) => {
      const memberRows = await db
        .select({ roomId: chatRoomMembers.roomId })
        .from(chatRoomMembers)
        .where(
          and(
            eq(chatRoomMembers.memberType, "agent"),
            eq(chatRoomMembers.memberId, agentId),
          ),
        );
      const roomIds = memberRows.map((r) => r.roomId);
      if (roomIds.length === 0) return [];
      const rooms = await db
        .select()
        .from(chatRooms)
        .where(and(eq(chatRooms.companyId, companyId), inArray(chatRooms.id, roomIds)));
      const ordered = roomIds.map((id) => rooms.find((r) => r.id === id)).filter(Boolean) as typeof rooms;
      const lastMessages = await Promise.all(
        ordered.map(async (room) => {
          const [msg] = await db
            .select()
            .from(chatMessages)
            .where(eq(chatMessages.roomId, room.id))
            .orderBy(desc(chatMessages.createdAt))
            .limit(1);
          return { roomId: room.id, lastMessage: msg ?? null };
        }),
      );
      const membersByRoom = await db
        .select({
          roomId: chatRoomMembers.roomId,
          memberType: chatRoomMembers.memberType,
          memberId: chatRoomMembers.memberId,
        })
        .from(chatRoomMembers)
        .where(inArray(chatRoomMembers.roomId, roomIds));
      const agentIds = [...new Set(
        membersByRoom.filter((m) => m.memberType === "agent").map((m) => m.memberId),
      )];
      const agentRows =
        agentIds.length > 0
          ? await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(eq(agents.companyId, companyId))
            .then((rows) => rows.filter((r) => agentIds.includes(r.id)))
          : [];
      const agentNameById = new Map(agentRows.map((a) => [a.id, a.name]));
      return ordered.map((room) => {
        const last = lastMessages.find((m) => m.roomId === room.id)?.lastMessage ?? null;
        const members = membersByRoom.filter((m) => m.roomId === room.id).map((m) => {
          if (m.memberType === "agent") {
            return { ...m, agentName: agentNameById.get(m.memberId) ?? null };
          }
          return { ...m, agentName: null as string | null };
        });
        return { ...room, lastMessage: last, members };
      });
    },

    /** 取得或建立「單一預設」與該 agent 的 direct room（不帶 name 時用）。 */
    getOrCreateDirectRoom: async (companyId: string, userId: string, agentId: string) => {
      const existing = await db
        .select()
        .from(chatRooms)
        .where(
          and(
            eq(chatRooms.companyId, companyId),
            eq(chatRooms.type, "direct"),
          ),
        );
      for (const room of existing) {
        const members = await db
          .select()
          .from(chatRoomMembers)
          .where(eq(chatRoomMembers.roomId, room.id));
        const hasUser = members.some((m) => m.memberType === "user" && m.memberId === userId);
        const hasAgent = members.some((m) => m.memberType === "agent" && m.memberId === agentId);
        if (members.length === 2 && hasUser && hasAgent) return room;
      }
      const [room] = await db
        .insert(chatRooms)
        .values({ companyId, type: "direct", name: null, awaitingSessionTitle: false })
        .returning();
      if (!room) throw new Error("Failed to create chat room");
      await db.insert(chatRoomMembers).values([
        { roomId: room.id, memberType: "user", memberId: userId },
        { roomId: room.id, memberType: "agent", memberId: agentId },
      ]);
      return room;
    },

    /** 一律建立新的 direct room，可選填 name（session 顯示名稱）。同一 (user, agent) 可有多個具名 session。 */
    createDirectRoom: async (
      companyId: string,
      userId: string,
      agentId: string,
      name?: string | null,
      opts?: { awaitingSessionTitle?: boolean },
    ) => {
      const [room] = await db
        .insert(chatRooms)
        .values({
          companyId,
          type: "direct",
          name: name ?? null,
          awaitingSessionTitle: Boolean(opts?.awaitingSessionTitle),
        })
        .returning();
      if (!room) throw new Error("Failed to create chat room");
      await db.insert(chatRoomMembers).values([
        { roomId: room.id, memberType: "user", memberId: userId },
        { roomId: room.id, memberType: "agent", memberId: agentId },
      ]);
      return room;
    },

    createGroupRoom: async (
      companyId: string,
      userId: string,
      agentIds: string[],
      name?: string | null,
    ) => {
      const [room] = await db
        .insert(chatRooms)
        .values({ companyId, type: "group", name: name ?? null, awaitingSessionTitle: false })
        .returning();
      if (!room) throw new Error("Failed to create chat room");
      const memberRows: Array<{ roomId: string; memberType: string; memberId: string }> = [
        { roomId: room.id, memberType: "user", memberId: userId },
        ...agentIds.map((id) => ({ roomId: room.id, memberType: "agent" as const, memberId: id })),
      ];
      await db.insert(chatRoomMembers).values(memberRows);
      return room;
    },

    listMembers: async (companyId: string, roomId: string) => {
      const room = await getRoom(companyId, roomId);
      if (!room) return null;
      const members = await db
        .select()
        .from(chatRoomMembers)
        .where(eq(chatRoomMembers.roomId, roomId));
      const agentIds = members.filter((m) => m.memberType === "agent").map((m) => m.memberId);
      const agentRows =
        agentIds.length > 0
          ? await db
            .select({ id: agents.id, name: agents.name, role: agents.role })
            .from(agents)
            .where(eq(agents.companyId, companyId))
            .then((rows) => rows.filter((r) => agentIds.includes(r.id)))
          : [];
      return {
        room,
        members: members.map((m) => {
          if (m.memberType === "agent") {
            const agent = agentRows.find((a) => a.id === m.memberId);
            return { ...m, agentName: agent?.name ?? null, agentRole: agent?.role ?? null };
          }
          return { ...m, agentName: null, agentRole: null };
        }),
      };
    },

    /**
     * 更新聊天室「針對專案」持久化選取；呼叫端須先驗證 actor 為該房成員（board 或 agent）。
     * 專案須屬於該公司且未封存；傳 null 表示清除。
     */
    updateRoomComposerProject: async (
      companyId: string,
      roomId: string,
      composerProjectId: string | null,
      actor: ChatActor,
    ) => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      const allowed = await isMember(roomId, actor);
      if (!allowed) throw forbidden("Not a member of this chat room");

      let resolved: string | null = null;
      if (composerProjectId && composerProjectId.trim()) {
        const [proj] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, composerProjectId.trim()),
              eq(projects.companyId, companyId),
              isNull(projects.archivedAt),
            ),
          )
          .limit(1);
        if (!proj) {
          throw unprocessable("Project not found, archived, or not in this company");
        }
        resolved = proj.id;
      }

      await db
        .update(chatRooms)
        .set({ composerProjectId: resolved, updatedAt: new Date() })
        .where(and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)));

      return chatSvc.listMembers(companyId, roomId);
    },

    /**
     * 更新群組聊天室成員（僅 AI 成員）。
     * 規則：
     * - 僅允許 type=group
     * - 新增的 agent 必須屬於同一 company
     * - 移除時不可把群組 AI 清空（至少保留 1 位）
     * - 群組 AI 上限：MAX_GROUP_AGENT_COUNT
     */
    updateGroupMembers: async (
      companyId: string,
      roomId: string,
      input: { addAgentIds: string[]; removeAgentIds: string[] },
    ) => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      if (room.type !== "group") throw unprocessable("Only group rooms support member updates");

      const addSet = new Set((input.addAgentIds ?? []).map((x) => x.trim()).filter(Boolean));
      const removeSet = new Set((input.removeAgentIds ?? []).map((x) => x.trim()).filter(Boolean));
      if (addSet.size === 0 && removeSet.size === 0) {
        throw unprocessable("Must provide addAgentIds or removeAgentIds");
      }

      const members = await db
        .select({ memberType: chatRoomMembers.memberType, memberId: chatRoomMembers.memberId })
        .from(chatRoomMembers)
        .where(eq(chatRoomMembers.roomId, roomId));

      const currentAgentIds = members
        .filter((m) => m.memberType === "agent")
        .map((m) => m.memberId);
      const currentAgentSet = new Set(currentAgentIds);

      // Validate remove: must exist in room
      for (const id of removeSet) {
        if (!currentAgentSet.has(id)) {
          throw unprocessable("Cannot remove: agent is not a member of this room");
        }
      }

      // Validate add: must exist in company (and not already member)
      const addCandidates = [...addSet].filter((id) => !currentAgentSet.has(id));
      if (addCandidates.length > 0) {
        const rows = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.companyId, companyId));
        const companyAgentIds = new Set(rows.map((r) => r.id));
        for (const id of addCandidates) {
          if (!companyAgentIds.has(id)) throw unprocessable("Cannot add: agent not found in this company");
        }
      }

      const nextAgentIds = [...currentAgentIds]
        .filter((id) => !removeSet.has(id))
        .concat(addCandidates);

      const uniqueNext = [...new Set(nextAgentIds)];
      if (uniqueNext.length === 0) throw unprocessable("Group must include at least one agent");
      if (uniqueNext.length > MAX_GROUP_AGENT_COUNT) {
        throw unprocessable(`Group agent limit exceeded (max ${MAX_GROUP_AGENT_COUNT})`);
      }

      await db.transaction(async (tx) => {
        if (removeSet.size > 0) {
          await tx
            .delete(chatRoomMembers)
            .where(
              and(
                eq(chatRoomMembers.roomId, roomId),
                eq(chatRoomMembers.memberType, "agent"),
                inArray(chatRoomMembers.memberId, [...removeSet]),
              ),
            );
        }
        if (addCandidates.length > 0) {
          await tx.insert(chatRoomMembers).values(
            addCandidates.map((id) => ({ roomId, memberType: "agent" as const, memberId: id })),
          );
        }
        await tx
          .update(chatRooms)
          .set({ updatedAt: new Date() })
          .where(and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)));
      });

      return chatSvc.listMembers(companyId, roomId);
    },

    listMessages: async (
      companyId: string,
      roomId: string,
      limit: number,
      before?: string | null,
    ) => {
      const room = await getRoom(companyId, roomId);
      if (!room) return null;
      const conditions = [eq(chatMessages.roomId, roomId), eq(chatMessages.companyId, companyId)];
      if (before) {
        const beforeRow = await db
          .select({ createdAt: chatMessages.createdAt })
          .from(chatMessages)
          .where(eq(chatMessages.id, before))
          .then((rows) => rows[0] ?? null);
        if (beforeRow) {
          conditions.push(lt(chatMessages.createdAt, beforeRow.createdAt));
        }
      }
      const rows = await db
        .select()
        .from(chatMessages)
        .where(and(...conditions))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);
      const agentIds = [...new Set(rows.map((r) => r.authorAgentId).filter(Boolean))] as string[];
      const agentList =
        agentIds.length > 0
          ? await db
            .select({ id: agents.id, name: agents.name, icon: agents.icon })
            .from(agents)
            .where(eq(agents.companyId, companyId))
            .then((rows) => rows.filter((r) => agentIds.includes(r.id)))
          : [];
      const agentNameMap = new Map(agentList.map((a) => [a.id, a.name]));
      const agentIconMap = new Map(agentList.map((a) => [a.id, a.icon]));
      return rows.map((r) => ({
        ...r,
        authorAgentName: r.authorAgentId ? agentNameMap.get(r.authorAgentId) ?? null : null,
        authorAgentIcon: r.authorAgentId ? agentIconMap.get(r.authorAgentId) ?? null : null,
      }));
    },

    /** 清空指定聊天室的所有訊息（僅 board）。保留房間與成員、備註與置頂設定。 */
    clearMessages: async (companyId: string, roomId: string): Promise<void> => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      // 僅允許公司內的 board 呼叫此服務；路由層已做 board 驗證。
      await db
        .delete(chatMessages)
        .where(and(eq(chatMessages.companyId, companyId), eq(chatMessages.roomId, roomId)));
      // 更新房間時間戳，讓清空後的狀態反映在列表排序。
      await db
        .update(chatRooms)
        .set({ updatedAt: new Date() })
        .where(and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)));
    },

    addMessage: async (
      companyId: string,
      roomId: string,
      body: string,
      actor: ChatActor,
      projectId?: string | null,
      runId?: string | null,
      options?: { skipMembershipCheck?: boolean },
    ) => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      if (!options?.skipMembershipCheck) {
        const allowed = await isMember(roomId, actor);
        if (!allowed) throw forbidden("Not a member of this chat room");
      }

      const authorAgentId = actor.type === "agent" ? actor.agentId : null;
      const authorUserId = actor.type === "board" ? actor.userId : null;
      /** 僅在 actor 為 agent 且請求帶有 runId 時寫入，供 adapter 判斷是否已透過工具回覆。 */
      const authorRunId =
        actor.type === "agent" && runId && runId.trim().length > 0 ? runId.trim() : null;

      /** 若有指定專案，確認屬於同一公司後才寫入。 */
      let resolvedProjectId: string | null = null;
      if (projectId && projectId.trim()) {
        const [proj] = await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(eq(projects.id, projectId.trim()), eq(projects.companyId, companyId)))
          .limit(1);
        if (proj) resolvedProjectId = proj.id;
      }

      const [msg] = await db
        .insert(chatMessages)
        .values({
          roomId,
          companyId,
          authorAgentId,
          authorUserId,
          projectId: resolvedProjectId,
          authorRunId,
          body,
        })
        .returning();
      if (!msg) throw new Error("Failed to insert chat message");

      /** 若有指定專案，解析專案名稱供 agent context 使用。 */
      let chatProjectName: string | null = null;
      if (resolvedProjectId) {
        const [proj] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, resolvedProjectId))
          .limit(1);
        if (proj) chatProjectName = proj.name;
      }

      const memberRows = await db
        .select({
          memberType: chatRoomMembers.memberType,
          memberId: chatRoomMembers.memberId,
        })
        .from(chatRoomMembers)
        .where(eq(chatRoomMembers.roomId, roomId));
      const memberAgentIds = memberRows
        .filter((row) => row.memberType === "agent")
        .map((row) => row.memberId);
      const memberUserIds = memberRows
        .filter((row) => row.memberType === "user")
        .map((row) => row.memberId);

      let mentionedIds: string[] = [];
      try {
        mentionedIds = await issuesSvc.findMentionedAgents(companyId, body);
      } catch {
        // ignore parse errors
      }
      mentionedIds = mergeEveryoneMentionedAgentIds(
        room.type,
        body,
        mentionedIds,
        memberAgentIds,
      );

      const skillInvocations = parseSkillInvocations(body);

      if (storage && skillInvocations.length > 0 && actor.type === "board" && memberAgentIds.length > 0) {
        const wfSvc = createWorkflowRunService(db, storage);
        try {
          const loaded = await loadCompanySkillsForInjection({ db, storage, companyId });
          const byKey = new Map(loaded.map((s) => [normalizeSkillKeyForChat(s.key), s]));
          const facilitatorAgentId = memberAgentIds[0]!;
          for (const inv of skillInvocations) {
            const row = byKey.get(normalizeSkillKeyForChat(inv.name));
            if (!row) {
              continue;
            }
            if (!shouldAutoStartWorkflowRunFromChatInvocation(row.frontmatter)) {
              continue;
            }
            await wfSvc.startRun({
              companyId,
              skillKey: normalizeSkillKeyForChat(inv.name),
              invocationArgs: inv.args,
              agentId: facilitatorAgentId,
              chatRoomId: roomId,
            });
          }
        } catch (err) {
          logger.warn({ err, companyId, roomId }, "chat workflow auto-start failed");
        }
      }

      const wakeups = new Map<
        string,
        {
          payload: Record<string, unknown>;
          contextSnapshot: Record<string, unknown>;
          reason: string;
        }
      >();
      const basePayload = {
        roomId,
        messageId: msg.id,
        ...(skillInvocations.length > 0 ? { skillInvocations } : {}),
      };
      const baseContext: Record<string, unknown> = {
        roomId,
        chatRoomType: room.type,
        messageId: msg.id,
        taskKey: `chat:${roomId}`,
        // 輕量聊天模式：僅用於對話與需求澄清，避免每則訊息都啟動完整 workspace 準備。
        chatMode: "light",
        ...(resolvedProjectId && chatProjectName
          ? { chatProjectId: resolvedProjectId, chatProjectName }
          : {}),
        participants: {
          agents: memberAgentIds,
          users: memberUserIds,
        },
        discussion: {
          facilitatorAgentId: memberAgentIds[0] ?? null,
          votingRule: {
            kind: "simple_majority",
            threshold: 0.5,
          },
        },
        ...(skillInvocations.length > 0 ? { skillInvocations } : {}),
      };

      /**
       * 喚醒語意標籤（短字串，供 prompt / 環境變數辨識）。
       * 完整操作說明已內建於各 adapter 的 chatModePrefix；此處避免重複長文以節省 input token。
       */
      const wakeLabelGroupMention = "chat.group.mention";
      const wakeLabelGroupBroadcast = "chat.group.broadcast";
      const wakeLabelDirect = "chat.direct";

      for (const agentId of mentionedIds) {
        if (!memberAgentIds.includes(agentId)) continue;
        if (actor.type === "agent" && actor.agentId === agentId) continue;
        wakeups.set(agentId, {
          payload: basePayload,
            contextSnapshot: {
              ...baseContext,
              wakeReason: "chat_message_mentioned",
              wakeReasonLabel: room.type === "group" ? wakeLabelGroupMention : wakeLabelDirect,
              source: "chat.mention",
            },
          reason: "chat_message_mentioned",
        });
      }

      if (actor.type === "board") {
        for (const agentId of memberAgentIds) {
          if (wakeups.has(agentId)) continue;
          wakeups.set(agentId, {
            payload: basePayload,
            contextSnapshot: {
              ...baseContext,
              wakeReason: "chat_message",
              wakeReasonLabel: room.type === "group" ? wakeLabelGroupBroadcast : wakeLabelDirect,
              source: "chat.message",
            },
            reason: "chat_message",
          });
        }
      }

      for (const [agentId, { payload, contextSnapshot, reason }] of wakeups) {
        const idempotencyKey = `chat:${roomId}:msg:${msg.id}:agent:${agentId}`;
        try {
          await heartbeat.wakeup(agentId, {
            source: "automation",
            triggerDetail: "system",
            reason,
            payload,
            requestedByActorType: actor.type === "board" ? "user" : "agent",
            requestedByActorId: actor.type === "board" ? actor.userId : actor.agentId,
            contextSnapshot,
            idempotencyKey,
          });
        } catch (err) {
          logger.error({ err, agentId, roomId, reason }, "chat wakeup failed");
        }
      }

      // Push live event for real-time chat updates (WebSocket subscribers).
      let authorAgentName: string | null = null;
      let authorAgentIcon: string | null = null;
      if (msg.authorAgentId) {
        const [agentRow] = await db
          .select({ name: agents.name, icon: agents.icon })
          .from(agents)
          .where(and(eq(agents.id, msg.authorAgentId), eq(agents.companyId, companyId)))
          .limit(1);
        if (agentRow) {
          authorAgentName = agentRow.name;
          authorAgentIcon = agentRow.icon;
        }
      }
      const messageForEvent: ChatMessage = {
        ...msg,
        authorAgentName: authorAgentName ?? undefined,
        authorAgentIcon: authorAgentIcon ?? undefined,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
        updatedAt: msg.updatedAt instanceof Date ? msg.updatedAt.toISOString() : String(msg.updatedAt),
      };
      publishLiveEvent({
        companyId,
        type: "chat.message.created",
        payload: {
          roomId,
          message: messageForEvent,
        },
      });

      if (actor.type === "board" && room.type === "direct" && room.awaitingSessionTitle) {
        try {
          const claimed = await claimDirectRoomForSessionTitleJob(db, companyId, roomId);
          if (claimed) {
            const textForTitle = body.trim();
            void (async () => {
              const title = await generateChatSessionTitleFromUserText(textForTitle);
              if (!title) return;
              const [updated] = await db
                .update(chatRooms)
                .set({ name: title, updatedAt: new Date() })
                .where(and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)))
                .returning({ id: chatRooms.id });
              if (updated) {
                publishLiveEvent({
                  companyId,
                  type: "chat.room.updated",
                  payload: { roomId, name: title },
                });
              }
            })();
          }
        } catch (err) {
          logger.warn({ err, roomId }, "chat session title scheduling failed");
        }
      }

      return msg;
    },

    isMember: async (roomId: string, actor: ChatActor) => {
      return isMember(roomId, actor);
    },

    getListPreferences: async (companyId: string): Promise<ChatListPreferences> => {
      const rows = await db
        .select()
        .from(chatListPreferences)
        .where(eq(chatListPreferences.companyId, companyId));
      const notes: Record<string, string> = {};
      const pinned: string[] = [];
      const pinnedWithOrder = rows
        .filter((r) => r.pinnedOrder > 0)
        .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
      for (const r of pinnedWithOrder) pinned.push(r.entityId);
      for (const r of rows) {
        if (r.note != null && r.note !== "") notes[r.entityId] = r.note;
      }
      return { notes, pinned };
    },

    saveListPreferences: async (companyId: string, prefs: ChatListPreferences): Promise<void> => {
      await db.transaction(async (tx) => {
        await tx.delete(chatListPreferences).where(eq(chatListPreferences.companyId, companyId));
        const entityIds = new Set<string>([
          ...Object.keys(prefs.notes),
          ...prefs.pinned,
        ]);
        if (entityIds.size === 0) return;
        const pinnedOrderByEntity = new Map<string, number>();
        prefs.pinned.forEach((id, index) => pinnedOrderByEntity.set(id, index + 1));
        for (const entityId of entityIds) {
          await tx.insert(chatListPreferences).values({
            companyId,
            entityId,
            note: prefs.notes[entityId] ?? null,
            pinnedOrder: pinnedOrderByEntity.get(entityId) ?? 0,
          });
        }
      });
    },

    /** 允許刪除 direct 或 group 房間；board 限定。刪除後會自 list preferences 移除該房間。 */
    deleteRoom: async (companyId: string, roomId: string, actor: ChatActor): Promise<void> => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      const allowed = await isMember(roomId, actor);
      if (!allowed) throw forbidden("Not a member of this chat room");
      if (actor.type !== "board") throw forbidden("Only board can delete a chat room");

      const prefsRows = await db
        .select()
        .from(chatListPreferences)
        .where(eq(chatListPreferences.companyId, companyId));
      const pinnedWithOrder = prefsRows
        .filter((r) => r.entityId !== roomId && r.pinnedOrder > 0)
        .sort((a, b) => a.pinnedOrder - b.pinnedOrder);
      const newPinned = pinnedWithOrder.map((r) => r.entityId);
      const newNotes: Record<string, string> = {};
      for (const r of prefsRows) {
        if (r.entityId !== roomId && r.note != null && r.note !== "") newNotes[r.entityId] = r.note;
      }
      await db.transaction(async (tx) => {
        await tx.delete(chatListPreferences).where(eq(chatListPreferences.companyId, companyId));
        const entityIds = new Set<string>([...Object.keys(newNotes), ...newPinned]);
        const pinnedOrderByEntity = new Map<string, number>();
        newPinned.forEach((id, index) => pinnedOrderByEntity.set(id, index + 1));
        for (const entityId of entityIds) {
          await tx.insert(chatListPreferences).values({
            companyId,
            entityId,
            note: newNotes[entityId] ?? null,
            pinnedOrder: pinnedOrderByEntity.get(entityId) ?? 0,
          });
        }
      });

      await db.delete(chatRooms).where(
        and(eq(chatRooms.id, roomId), eq(chatRooms.companyId, companyId)),
      );
    },
  };
  return chatSvc;
}
