import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, chatRoomMembers, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { chatService, type ChatHeartbeat } from "../services/chat.js";
import { heartbeatService } from "../services/heartbeat.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import type { ChatActor } from "../services/chat.js";
import {
  createChatRoomSchema,
  addChatMessageSchema,
  updateChatRoomSchema,
  updateChatRoomMembersSchema,
  updateChatListPreferencesSchema,
} from "@paperclipai/shared";
import { assertAgentChatAllowedForWorkflow } from "../lib/workflow-chat-guard.js";

export type ChatServiceInstance = ReturnType<typeof chatService>;

export function chatRoutes(db: Db, chatInstance?: ChatServiceInstance) {
  const router = Router();
  const heartbeat = heartbeatService(db);
  const chat = chatInstance ?? chatService(db, heartbeat as ChatHeartbeat);

  function getBoardUserId(req: { actor: { type: string; userId?: string | null } }): string {
    if (req.actor.type !== "board") return "board";
    return req.actor.userId ?? "board";
  }

  function getActor(req: { actor: { type: string; userId?: string | null; agentId?: string | null; companyId?: string } }) {
    if (req.actor.type === "board") {
      return { type: "board" as const, userId: getBoardUserId(req) };
    }
    return { type: "agent" as const, agentId: req.actor.agentId ?? "" };
  }

  /**
   * 當請求以 board 身份發送但帶有 X-Paperclip-Run-Id 時，若該 run 為此聊天室的 agent run，
   * 則將訊息歸屬為該 agent，避免 adapter 未帶 Bearer 時 AI 回覆被誤記為使用者發送。
   */
  async function resolveActorForAddMessage(
    req: { actor: { type: string; userId?: string | null }; header: (name: string) => string | undefined },
    companyId: string,
    roomId: string,
    baseActor: ChatActor,
  ): Promise<ChatActor> {
    if (baseActor.type !== "board") return baseActor;
    const runId = req.header("x-paperclip-run-id")?.trim();
    if (!runId) return baseActor;
    const [run] = await db
      .select({
        id: heartbeatRuns.id,
        agentId: heartbeatRuns.agentId,
        companyId: heartbeatRuns.companyId,
        contextSnapshot: heartbeatRuns.contextSnapshot,
      })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .limit(1);
    if (!run || run.companyId !== companyId) return baseActor;
    const taskKey = run.contextSnapshot && typeof run.contextSnapshot === "object" && typeof run.contextSnapshot.taskKey === "string"
      ? run.contextSnapshot.taskKey
      : null;
    if (taskKey !== `chat:${roomId}`) return baseActor;
    const members = await db
      .select({ memberType: chatRoomMembers.memberType, memberId: chatRoomMembers.memberId })
      .from(chatRoomMembers)
      .where(eq(chatRoomMembers.roomId, roomId));
    const isAgentInRoom = members.some((m) => m.memberType === "agent" && m.memberId === run.agentId);
    if (!isAgentInRoom) return baseActor;
    return { type: "agent", agentId: run.agentId };
  }

  /** Get chat list preferences (notes + pinned) for the company. Board only. */
  router.get("/:companyId/chat/list-preferences", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    assertBoard(req);
    const prefs = await chat.getListPreferences(companyId);
    return res.json(prefs);
  });

  /** Update chat list preferences. Board only. */
  router.put("/:companyId/chat/list-preferences", validate(updateChatListPreferencesSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    assertBoard(req);
    const body = req.body as { notes: Record<string, string>; pinned: string[] };
    await chat.saveListPreferences(companyId, { notes: body.notes, pinned: body.pinned });
    return res.status(204).send();
  });

  /** List rooms (board or agent). Agent sees only rooms they are in. */
  router.get("/:companyId/chat/rooms", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "board") {
      assertBoard(req);
      const rooms = await chat.listRooms(companyId, getBoardUserId(req));
      return res.json(rooms);
    }
    if (req.actor.type === "agent") {
      const rooms = await chat.listRoomsForAgent(companyId, req.actor.agentId ?? "");
      return res.json(rooms);
    }
    return res.status(403).json({ error: "Forbidden" });
  });

  /** Create room (board only): direct with one agent, or group with multiple agents. */
  router.post("/:companyId/chat/rooms", validate(createChatRoomSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    assertBoard(req);
    const body = req.body as {
      type: "direct" | "group";
      agentId?: string;
      agentIds?: string[];
      name?: string | null;
      autoSessionTitle?: boolean;
    };
    if (body.type === "direct" && body.agentId) {
      const nameTrimmed = typeof body.name === "string" ? body.name.trim() || undefined : undefined;
      if (body.autoSessionTitle === true && !nameTrimmed) {
        return res.status(400).json({ error: "autoSessionTitle requires a non-empty name" });
      }
      const room = nameTrimmed
        ? await chat.createDirectRoom(companyId, getBoardUserId(req), body.agentId, nameTrimmed, {
            awaitingSessionTitle: body.autoSessionTitle === true,
          })
        : await chat.getOrCreateDirectRoom(companyId, getBoardUserId(req), body.agentId);
      const detail = await chat.listMembers(companyId, room.id);
      return res.status(201).json(detail ?? { room, members: [] });
    }
    if (body.type === "group" && Array.isArray(body.agentIds) && body.agentIds.length > 0) {
      const room = await chat.createGroupRoom(
        companyId,
        getBoardUserId(req),
        body.agentIds,
        body.name ?? null,
      );
      const detail = await chat.listMembers(companyId, room.id);
      return res.status(201).json(detail ?? { room, members: [] });
    }
    return res.status(400).json({ error: "Invalid body: use type direct with agentId, or type group with agentIds" });
  });

  /** Active runs for this chat room (running/queued with taskKey=chat:roomId). Used for typing indicator. */
  router.get("/:companyId/chat/rooms/:roomId/active-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    const actor = getActor(req);
    const member = await chat.isMember(roomId, actor);
    if (!member) return res.status(403).json({ error: "Not a member of this chat room" });

    const taskKey = `chat:${roomId}`;
    const runs = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        agentId: heartbeatRuns.agentId,
        agentName: agentsTable.name,
      })
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
          sql`${heartbeatRuns.contextSnapshot} ->> 'taskKey' = ${taskKey}`,
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    return res.json(runs);
  });

  /** Get room + members (board or agent; agent only if member). */
  router.get("/:companyId/chat/rooms/:roomId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    const detail = await chat.listMembers(companyId, roomId);
    if (!detail) return res.status(404).json({ error: "Chat room not found" });
    const actor = getActor(req);
    const member = await chat.isMember(roomId, actor);
    if (!member) return res.status(403).json({ error: "Not a member of this chat room" });
    return res.json(detail);
  });

  /**
   * 更新聊天室設定（目前：持久化「針對專案」選取）。
   * 須為此聊天室成員（與 GET /rooms/:roomId 相同：getActor + isMember，非成員 403）；board 與 agent 皆可。
   */
  router.patch("/:companyId/chat/rooms/:roomId", validate(updateChatRoomSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    const actor = getActor(req);
    const member = await chat.isMember(roomId, actor);
    if (!member) return res.status(403).json({ error: "Not a member of this chat room" });
    const body = req.body as { composerProjectId: string | null };
    const detail = await chat.updateRoomComposerProject(companyId, roomId, body.composerProjectId, actor);
    if (!detail) return res.status(404).json({ error: "Chat room not found" });
    return res.json(detail);
  });

  /**
   * 更新群組聊天室成員（僅 board）。
   * - 只允許操作 type=group 的房間
   * - 只允許新增/移除 AI 成員（Board 成員固定保留）
   */
  router.patch(
    "/:companyId/chat/rooms/:roomId/members",
    validate(updateChatRoomMembersSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      await assertCompanyAccess(req, companyId, db);
      assertBoard(req);
      const actor = getActor(req);
      const member = await chat.isMember(roomId, actor);
      if (!member) return res.status(403).json({ error: "Not a member of this chat room" });

      const body = req.body as { addAgentIds?: string[]; removeAgentIds?: string[] };
      const detail = await chat.updateGroupMembers(companyId, roomId, {
        addAgentIds: body.addAgentIds ?? [],
        removeAgentIds: body.removeAgentIds ?? [],
      });
      return res.json(detail);
    },
  );

  /** List messages (board or agent; agent only if member). */
  router.get("/:companyId/chat/rooms/:roomId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = (req.query.before as string) || undefined;
    const actor = getActor(req);
    const member = await chat.isMember(roomId, actor);
    if (!member) return res.status(403).json({ error: "Not a member of this chat room" });
    const messages = await chat.listMessages(companyId, roomId, limit, before ?? null);
    if (messages === null) return res.status(404).json({ error: "Chat room not found" });
    return res.json(messages);
  });

  /** Clear all messages in a room (board only). Keeps room and members. */
  router.delete("/:companyId/chat/rooms/:roomId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    assertBoard(req);
    await chat.clearMessages(companyId, roomId);
    return res.status(204).send();
  });

  /** Add message (board or agent; agent only if member). */
  router.post("/:companyId/chat/rooms/:roomId/messages", validate(addChatMessageSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    let actor = getActor(req);
    actor = await resolveActorForAddMessage(req, companyId, roomId, actor);
    await assertAgentChatAllowedForWorkflow(
      db,
      req,
      companyId,
      roomId,
      actor.type,
      actor.type === "agent" ? actor.agentId : null,
    );
    const body = req.body as { body: string; projectId?: string | null };
    const projectId = body.projectId && body.projectId.trim() ? body.projectId.trim() : null;
    const runId = req.header("x-paperclip-run-id")?.trim() ?? null;
    const msg = await chat.addMessage(companyId, roomId, body.body, actor, projectId, runId);
    return res.status(201).json(msg);
  });

  /** Delete chat room, direct or group (board only). */
  router.delete("/:companyId/chat/rooms/:roomId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    await assertCompanyAccess(req, companyId, db);
    assertBoard(req);
    const actor = getActor(req);
    await chat.deleteRoom(companyId, roomId, actor);
    return res.status(204).send();
  });

  return router;
}
