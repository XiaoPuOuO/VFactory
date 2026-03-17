import { eq, and, desc, inArray, lt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { chatRooms, chatRoomMembers, chatMessages, chatListPreferences, agents, projects } from "@paperclipai/db";
import type { ChatListPreferences, ChatMessage } from "@paperclipai/shared";
import { notFound, forbidden } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { issueService } from "./issues.js";
import { publishLiveEvent } from "./live-events.js";

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
  }) => Promise<unknown>;
};

export function chatService(
  db: Db,
  heartbeat: ChatHeartbeat,
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

  return {
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
        .values({ companyId, type: "direct", name: null })
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
    ) => {
      const [room] = await db
        .insert(chatRooms)
        .values({ companyId, type: "direct", name: name ?? null })
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
        .values({ companyId, type: "group", name: name ?? null })
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
    ) => {
      const room = await getRoom(companyId, roomId);
      if (!room) throw notFound("Chat room not found");
      const allowed = await isMember(roomId, actor);
      if (!allowed) throw forbidden("Not a member of this chat room");

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

      const wakeups = new Map<
        string,
        {
          payload: Record<string, unknown>;
          contextSnapshot: Record<string, unknown>;
          reason: string;
        }
      >();
      const basePayload = { roomId, messageId: msg.id };
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
      };

      /**
       * 供 agent 辨識：此次 heartbeat 因聊天被喚醒。
       * 群組聊天中才需要先判斷是否與自己職責相關；1:1 直接聊天應直接回覆。
       * 回覆時若對話需要，可在此 run 內建立 Goal（POST .../goals）或 Issue（POST .../issues）。
       */
      const chatWakeLabel = room.type === "group"
        ? "You were woken because someone sent a message in a GROUP chat room. Fetch the conversation with GET /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages. Then decide whether the triggering message is relevant to YOU based on your Role and Agent description (e.g. you were @mentioned, or the message clearly refers to you or your responsibilities). If it is NOT directed at you or not relevant to your role, do NOT reply (do not POST). Only reply with POST .../messages if you determine the message is relevant to you. If the conversation calls for it, you may also create goals (GET /api/companies/$PAPERCLIP_COMPANY_ID/goals, POST .../goals with { title, description?, level?, parentId?, recurrence?: \"one_time\"|\"daily\"|\"weekly\"|\"monthly\"|\"custom\" (default one_time); if recurrence is \"custom\" also send recurrenceIntervalDays, recurrenceIntervalHours, recurrenceIntervalMinutes, recurrenceIntervalSeconds with at least one > 0 }) or issues (POST /api/companies/$PAPERCLIP_COMPANY_ID/issues) in the same run."
        : "You were woken because someone sent a message in a DIRECT 1:1 chat room. Fetch the conversation with GET /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages and reply to the user in this run with POST /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages. Do not apply group-chat relevance filtering for direct chats. If the conversation calls for it, you may also create goals (GET /api/companies/$PAPERCLIP_COMPANY_ID/goals, POST .../goals with { title, description?, level?, parentId?, recurrence?: \"one_time\"|\"daily\"|\"weekly\"|\"monthly\"|\"custom\" (default one_time); if recurrence is \"custom\" also send recurrenceIntervalDays, recurrenceIntervalHours, recurrenceIntervalMinutes, recurrenceIntervalSeconds with at least one > 0 }) or issues (POST /api/companies/$PAPERCLIP_COMPANY_ID/issues) in the same run.";

      for (const agentId of mentionedIds) {
        if (!memberAgentIds.includes(agentId)) continue;
        if (actor.type === "agent" && actor.agentId === agentId) continue;
        wakeups.set(agentId, {
          payload: basePayload,
            contextSnapshot: {
              ...baseContext,
              wakeReason: "chat_message_mentioned",
              wakeReasonLabel: chatWakeLabel,
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
              wakeReasonLabel: chatWakeLabel,
              source: "chat.message",
            },
            reason: "chat_message",
          });
        }
      }

      for (const [agentId, { payload, contextSnapshot, reason }] of wakeups) {
        heartbeat
          .wakeup(agentId, {
            source: "automation",
            triggerDetail: "system",
            reason,
            payload,
            requestedByActorType: actor.type === "board" ? "user" : "agent",
            requestedByActorId: actor.type === "board" ? actor.userId : actor.agentId,
            contextSnapshot,
          })
          .catch((err) => {
            logger.error({ err, agentId, roomId, reason }, "chat wakeup failed");
          });
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
}
