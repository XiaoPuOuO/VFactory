import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useCompany } from "../context/CompanyContext";
import type { ChatRoomWithMeta, ChatRoomMember } from "@paperclipai/shared";
import type { Agent } from "@paperclipai/shared";
import { Pin, Plus, MoreHorizontal, StickyNote, Trash2, ChevronDown, ChevronRight, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { chatApi } from "../api/chat";
import { queryKeys } from "../lib/queryKeys";
import { MAX_GROUP_AGENT_COUNT } from "@paperclipai/shared";

/** 群組顯示名稱：含 Board（董事長/Board）+ AI，以 " & " 串接，過長則省略，人數必顯示（含 Board）。 */
const GROUP_NAME_MAX_VISIBLE = 120;

function roomDisplayName(room: ChatRoomWithMeta, boardLabel: string): string {
  if (room.type !== "group") {
    const agentMember = room.members.find((m: ChatRoomMember) => m.memberType === "agent");
    return agentMember?.agentName ?? room.id.slice(0, 8);
  }
  const userMembers = room.members.filter((m: ChatRoomMember) => m.memberType === "user");
  const agentMembers = room.members.filter((m: ChatRoomMember) => m.memberType === "agent");
  const userNames = userMembers.map(() => boardLabel);
  const agentNames = agentMembers.map((m) => (m as ChatRoomMember & { agentName?: string | null }).agentName ?? m.memberId.slice(0, 8));
  const names = [...userNames, ...agentNames];
  const n = room.members.length;
  const suffix = `(${n})`;
  const full = names.join(" & ");
  if (full.length <= GROUP_NAME_MAX_VISIBLE) return `${full} ${suffix}`;
  let visible = "";
  for (const name of names) {
    const next = visible ? `${visible} & ${name}` : name;
    if (next.length + 4 + suffix.length <= GROUP_NAME_MAX_VISIBLE) visible = next;
    else break;
  }
  return visible ? `${visible} & ...${suffix}` : `...${suffix}`;
}

function lastMessagePreview(msg: ChatRoomWithMeta["lastMessage"]): string {
  if (!msg || !msg.body) return "";
  const line = msg.body.split("\n")[0].trim();
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

/** 置頂用：Agent 的 pinned id 與 room id 分開，避免衝突 */
function agentPinnedId(agentId: string): string {
  return `agent:${agentId}`;
}

export interface ChatListProps {
  rooms: ChatRoomWithMeta[] | undefined;
  agents: Agent[];
  isLoadingRooms: boolean;
  /** 取得或建立預設一對一房（不帶名稱） */
  onCreateDirect: (agentId: string) => void;
  /** 建立新的 direct session（預設名稱，後端於第一則訊息後自動產生標題） */
  onCreateNewDirectSession?: (agentId: string) => void;
  createDirectPending: boolean;
  /** 多選 Agent 建立群組 */
  onCreateGroup?: (agentIds: string[], name?: string | null) => void;
  createGroupPending?: boolean;
  /** 刪除群組後回呼（例如導向聊天首頁）；若當前正在看該房間，呼叫方應導向 index */
  onAfterDeleteGroup?: (roomId: string) => void;
}

/** Agent 底下的多個 direct rooms（同一 agent 可有多個具名 session） */
type AgentGroup = { agent: Agent; rooms: ChatRoomWithMeta[] };

type GroupListEntry = { type: "group"; room: ChatRoomWithMeta; id: string; displayName: string };

/**
 * 聊天人員列表（Agent + 群組），支援搜尋、備註、置頂。
 * 備註與置頂儲存於資料庫，依公司分開。
 */
export function ChatList({
  rooms,
  agents,
  isLoadingRooms,
  onCreateDirect,
  onCreateNewDirectSession,
  createDirectPending,
  onCreateGroup,
  createGroupPending = false,
  onAfterDeleteGroup,
}: ChatListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const prefix = selectedCompany?.issuePrefix ?? "";
  const { roomId: activeRoomId } = useParams<{ roomId?: string }>();

  const roomRowLinkClass = useCallback(
    (roomId: string, ...extra: (string | false | undefined)[]) =>
      cn("chat-list-row-link", ...extra, activeRoomId === roomId && "chat-list-row-link--active"),
    [activeRoomId],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [deleteGroupRoomId, setDeleteGroupRoomId] = useState<string | null>(null);
  const [agentSectionCollapsed, setAgentSectionCollapsed] = useState(false);
  const [groupSectionCollapsed, setGroupSectionCollapsed] = useState(false);
  /** 摺疊的 agent（key = agentId）；僅多房時有效 */
  const [collapsedAgentIds, setCollapsedAgentIds] = useState<Record<string, boolean>>({});
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupSelectedIds, setNewGroupSelectedIds] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState("");

  const toggleAgentCollapsed = useCallback((agentId: string) => {
    setCollapsedAgentIds((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  }, []);

  const { data: preferences } = useQuery({
    queryKey: queryKeys.chat.listPreferences(selectedCompanyId ?? ""),
    queryFn: () => chatApi.getListPreferences(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const savePreferencesMutation = useMutation({
    mutationFn: (prefs: { notes: Record<string, string>; pinned: string[] }) =>
      chatApi.saveListPreferences(selectedCompanyId!, prefs),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.listPreferences(selectedCompanyId!),
      });
    },
  });

  const notes = preferences?.notes ?? {};
  const pinned = preferences?.pinned ?? [];

  const togglePin = useCallback(
    (id: string) => {
      const has = pinned.includes(id);
      const newPinned = has ? pinned.filter((x) => x !== id) : [id, ...pinned];
      savePreferencesMutation.mutate({ notes, pinned: newPinned });
    },
    [notes, pinned, savePreferencesMutation],
  );

  const openNoteEditor = useCallback((id: string, current: string) => {
    setEditingNoteKey(id);
    setEditingNoteValue(current);
  }, []);

  const saveNote = useCallback(() => {
    if (editingNoteKey === null || !selectedCompanyId) return;
    const newNotes = editingNoteValue.trim()
      ? { ...notes, [editingNoteKey]: editingNoteValue.trim() }
      : (() => {
          const next = { ...notes };
          delete next[editingNoteKey];
          return next;
        })();
    savePreferencesMutation.mutate({ notes: newNotes, pinned });
    setEditingNoteKey(null);
    setEditingNoteValue("");
  }, [editingNoteKey, editingNoteValue, notes, pinned, savePreferencesMutation, selectedCompanyId]);

  const deleteGroupMutation = useMutation({
    mutationFn: (roomId: string) => chatApi.deleteRoom(selectedCompanyId!, roomId),
    onSuccess: (_, roomId) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms(selectedCompanyId!) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.listPreferences(selectedCompanyId ?? ""),
      });
      setDeleteGroupRoomId(null);
      onAfterDeleteGroup?.(roomId);
    },
  });

  /** 依 agent 分組：同一 agent 可有多個 direct room（多個具名 session） */
  const directRoomsByAgentId = useMemo(() => {
    const map = new Map<string, ChatRoomWithMeta[]>();
    if (rooms) {
      for (const room of rooms) {
        if (room.type !== "direct") continue;
        const agentMember = room.members.find((m: ChatRoomMember) => m.memberType === "agent");
        if (agentMember) {
          const list = map.get(agentMember.memberId) ?? [];
          list.push(room);
          map.set(agentMember.memberId, list);
        }
      }
    }
    for (const list of map.values()) {
      const pinnedSet = new Set(pinned);
      list.sort((a, b) => {
        const aPinned = pinnedSet.has(a.id);
        const bPinned = pinnedSet.has(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        if (aPinned && bPinned) return pinned.indexOf(a.id) - pinned.indexOf(b.id);
        const aTime = a.lastMessage?.createdAt ?? a.updatedAt ?? "";
        const bTime = b.lastMessage?.createdAt ?? b.updatedAt ?? "";
        return bTime.localeCompare(aTime);
      });
    }
    return map;
  }, [rooms, pinned]);

  const boardLabel = t("chat.boardLabel");
  const defaultSessionLabel = t("chat.defaultSessionName");

  /** 每個 agent 一組，底下為其 direct rooms；無 room 的 agent 也保留（顯示「開始對話」） */
  const agentGroups = useMemo((): AgentGroup[] => {
    return agents.map((agent) => ({
      agent,
      rooms: directRoomsByAgentId.get(agent.id) ?? [],
    }));
  }, [agents, directRoomsByAgentId]);

  const query = searchQuery.trim().toLowerCase();
  /** 只顯示有至少一間房的 Agent；沒 Room 的 Agent 不顯示 */
  const filteredAgentGroups = useMemo(() => {
    let list = agentGroups.filter((group) => group.rooms.length >= 1);
    if (query) {
      list = list.filter((group) => {
        const agentMatch = group.agent.name.toLowerCase().includes(query);
        const roomMatch = group.rooms.some((room) => {
          const name = (room.name ?? notes[room.id] ?? defaultSessionLabel).toLowerCase();
          return name.includes(query) || (notes[room.id] ?? "").toLowerCase().includes(query);
        });
        return agentMatch || roomMatch;
      });
    }
    const pinnedSet = new Set(pinned);
    list = [...list].sort((a, b) => {
      const aPinned = pinnedSet.has(agentPinnedId(a.agent.id));
      const bPinned = pinnedSet.has(agentPinnedId(b.agent.id));
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) {
        const ai = pinned.indexOf(agentPinnedId(a.agent.id));
        const bi = pinned.indexOf(agentPinnedId(b.agent.id));
        return ai - bi;
      }
      const aMax = Math.max(
        0,
        ...a.rooms.map((r) => new Date(r.lastMessage?.createdAt ?? r.updatedAt ?? 0).getTime()),
      );
      const bMax = Math.max(
        0,
        ...b.rooms.map((r) => new Date(r.lastMessage?.createdAt ?? r.updatedAt ?? 0).getTime()),
      );
      if (bMax !== aMax) return bMax - aMax;
      return a.agent.name.localeCompare(b.agent.name);
    });
    return list;
  }, [agentGroups, query, notes, defaultSessionLabel, pinned]);

  const groupSectionEntries = useMemo((): GroupListEntry[] => {
    const groupRooms = (rooms ?? []).filter((r) => r.type === "group");
    let list = groupRooms.map((room) => ({
      type: "group" as const,
      room,
      id: room.id,
      displayName: roomDisplayName(room, boardLabel),
    }));
    if (query) {
      list = list.filter(
        (e) =>
          e.displayName.toLowerCase().includes(query) ||
          (notes[e.id] ?? "").toLowerCase().includes(query),
      );
    }
    const pinnedSet = new Set(pinned);
    list.sort((a, b) => {
      const aPinned = pinnedSet.has(a.id);
      const bPinned = pinnedSet.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      if (aPinned && bPinned) return pinned.indexOf(a.id) - pinned.indexOf(b.id);
      const aTime = a.room.lastMessage?.createdAt ?? a.room.updatedAt ?? "";
      const bTime = b.room.lastMessage?.createdAt ?? b.room.updatedAt ?? "";
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return a.displayName.localeCompare(b.displayName);
    });
    return list;
  }, [rooms, query, notes, pinned, boardLabel]);

  return (
    <div className="chat-list-root">
      <div className="chat-list-header">
        <h2 className="chat-list-title">{t("chat.title")}</h2>
        <Input
          type="search"
          placeholder={t("chat.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="chat-list-search"
          aria-label={t("chat.searchPlaceholder")}
        />
      </div>
      <div className="chat-list-scroll">
        {isLoadingRooms ? (
          <div className="chat-list-loading">{t("common.loading")}</div>
        ) : agents.length === 0 && (!rooms || rooms.length === 0) ? (
          <div className="chat-list-empty">{t("chat.noAgents")}</div>
        ) : (
          <div className="chat-list-sections">
            <section className="chat-list-section">
              <div className="chat-list-section-header-wrap">
                <button
                  type="button"
                  className="chat-list-section-header"
                  onClick={() => setAgentSectionCollapsed((c) => !c)}
                  aria-expanded={!agentSectionCollapsed}
                >
                  {agentSectionCollapsed ? (
                    <ChevronRight className="chat-list-section-chevron" aria-hidden />
                  ) : (
                    <ChevronDown className="chat-list-section-chevron" aria-hidden />
                  )}
                  <span className="chat-list-section-title">{t("chat.sectionAgentConversations")}</span>
                </button>
                <span className="chat-list-section-add-slot">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="chat-list-section-add-btn"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("chat.addAgentRoom")}
                        title={t("chat.addAgentRoom")}
                      >
                        <Plus className="chat-list-section-add-icon" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="chat-list-section-add-dropdown">
                      {agents.map((agent) => (
                        <DropdownMenuItem
                          key={agent.id}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!createDirectPending) onCreateDirect(agent.id);
                          }}
                          disabled={createDirectPending}
                        >
                          {agent.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
              {!agentSectionCollapsed && (
                <ul className="chat-list-ul chat-list-agent-tree">
                  {filteredAgentGroups.length === 0 ? (
                    <li className="chat-list-agent-empty">
                      <span className="chat-list-agent-empty-text">{t("chat.noAgentConversationsYet")}</span>
                    </li>
                  ) : (
                  filteredAgentGroups.map((group) => {
                    const { agent, rooms } = group;
                    const roomDisplayNameFor = (room: ChatRoomWithMeta) =>
                      room.name ?? notes[room.id] ?? defaultSessionLabel;
                    const isCollapsed = collapsedAgentIds[agent.id] === true;

                    /** 新增對話按鈕：置頂右邊、更多左邊 */
                    const newSessionBtn =
                      onCreateNewDirectSession ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="chat-list-header-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!createDirectPending) onCreateNewDirectSession(agent.id);
                          }}
                          aria-label={t("chat.newSession")}
                          title={t("chat.newSession")}
                        >
                          <MessageSquarePlus className="chat-list-new-session-icon" />
                        </Button>
                      ) : null;

                    /* 僅一間房：單一列，標題顯示 Agent 名稱（不顯示對話名稱） */
                    if (rooms.length === 1) {
                      const room = rooms[0];
                      const note = notes[room.id] ?? "";
                      const isPinned = pinned.includes(room.id);
                      const title = note || agent.name;
                      return (
                        <li key={agent.id}>
                          <Link
                            to={prefix ? `/${prefix}/chat/${room.id}` : `chat/${room.id}`}
                            className={roomRowLinkClass(room.id)}
                            aria-current={activeRoomId === room.id ? "page" : undefined}
                          >
                            <div className="chat-list-row-body">
                              <p className="chat-list-row-title">{title}</p>
                              {room.lastMessage ? (
                                <p className="chat-list-row-preview">
                                  {lastMessagePreview(room.lastMessage)}
                                </p>
                              ) : (
                                <p className="chat-list-row-preview">{t("chat.noMessagesYet")}</p>
                              )}
                            </div>
                            <div className="chat-list-row-actions" onClick={(e) => e.preventDefault()}>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="chat-list-header-btn"
                                onClick={(e) => {
                                  e.preventDefault();
                                  togglePin(room.id);
                                }}
                                aria-label={isPinned ? t("chat.unpin") : t("chat.pin")}
                                title={isPinned ? t("chat.unpin") : t("chat.pin")}
                              >
                                <Pin className={`chat-list-pin-icon ${isPinned ? "pinned" : ""}`} />
                              </Button>
                              {newSessionBtn}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="chat-list-header-btn"
                                    onClick={(e) => e.preventDefault()}
                                    aria-label={t("chat.note")}
                                  >
                                    <MoreHorizontal className="chat-list-menu-icon" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openNoteEditor(room.id, note);
                                    }}
                                  >
                                    <StickyNote className="chat-list-menu-item-icon" />
                                    {note ? t("chat.editNote") : t("chat.addNote")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.preventDefault();
                                      togglePin(room.id);
                                    }}
                                  >
                                    {isPinned ? (
                                      <>
                                        <Pin className="chat-list-menu-item-icon chat-list-pin-icon pinned" />
                                        {t("chat.unpin")}
                                      </>
                                    ) : (
                                      <>
                                        <Pin className="chat-list-menu-item-icon chat-list-pin-icon" />
                                        {t("chat.pin")}
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setDeleteGroupRoomId(room.id);
                                    }}
                                  >
                                    <Trash2 className="chat-list-menu-item-icon" />
                                    {t("chat.deleteConversation")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </Link>
                        </li>
                      );
                    }

                    /* 多房：agent 標題可摺疊，底下列出各房 */
                    return (
                      <li key={agent.id} className="chat-list-agent-group">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={!isCollapsed}
                          className="chat-list-agent-header chat-list-agent-header-collapsible"
                          onClick={() => toggleAgentCollapsed(agent.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleAgentCollapsed(agent.id);
                            }
                          }}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="chat-list-agent-chevron" aria-hidden />
                          ) : (
                            <ChevronDown className="chat-list-agent-chevron" aria-hidden />
                          )}
                          <span className="chat-list-agent-header-name">{agent.name}</span>
                          <div className="chat-list-agent-header-actions" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="chat-list-header-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                togglePin(agentPinnedId(agent.id));
                              }}
                              aria-label={pinned.includes(agentPinnedId(agent.id)) ? t("chat.unpin") : t("chat.pin")}
                              title={pinned.includes(agentPinnedId(agent.id)) ? t("chat.unpin") : t("chat.pin")}
                            >
                              <Pin className={`chat-list-pin-icon ${pinned.includes(agentPinnedId(agent.id)) ? "pinned" : ""}`} />
                            </Button>
                            {newSessionBtn}
                          </div>
                        </div>
                        {!isCollapsed && (
                          <ul className="chat-list-ul chat-list-agent-rooms">
                            {rooms.map((room) => {
                              const note = notes[room.id] ?? "";
                              const isPinned = pinned.includes(room.id);
                              const title = roomDisplayNameFor(room);
                              const rowContent = (
                                <>
                                  <div className="chat-list-row-body">
                                    <p className="chat-list-row-title">{note || title}</p>
                                    {room.lastMessage ? (
                                      <p className="chat-list-row-preview">
                                        {lastMessagePreview(room.lastMessage)}
                                      </p>
                                    ) : (
                                      <p className="chat-list-row-preview">{t("chat.noMessagesYet")}</p>
                                    )}
                                  </div>
                                  <div className="chat-list-row-actions" onClick={(e) => e.preventDefault()}>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className="chat-list-header-btn"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        togglePin(room.id);
                                      }}
                                      aria-label={isPinned ? t("chat.unpin") : t("chat.pin")}
                                      title={isPinned ? t("chat.unpin") : t("chat.pin")}
                                    >
                                      <Pin className={`chat-list-pin-icon ${isPinned ? "pinned" : ""}`} />
                                    </Button>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          className="chat-list-header-btn"
                                          onClick={(e) => e.preventDefault()}
                                          aria-label={t("chat.note")}
                                        >
                                          <MoreHorizontal className="chat-list-menu-icon" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.preventDefault();
                                            openNoteEditor(room.id, note);
                                          }}
                                        >
                                          <StickyNote className="chat-list-menu-item-icon" />
                                          {note ? t("chat.editNote") : t("chat.addNote")}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={(e) => {
                                            e.preventDefault();
                                            togglePin(room.id);
                                          }}
                                        >
                                          {isPinned ? (
                                            <>
                                              <Pin className="chat-list-menu-item-icon chat-list-pin-icon pinned" />
                                              {t("chat.unpin")}
                                            </>
                                          ) : (
                                            <>
                                              <Pin className="chat-list-menu-item-icon chat-list-pin-icon" />
                                              {t("chat.pin")}
                                            </>
                                          )}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            setDeleteGroupRoomId(room.id);
                                          }}
                                        >
                                          <Trash2 className="chat-list-menu-item-icon" />
                                          {t("chat.deleteConversation")}
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </>
                              );
                              return (
                                <li key={room.id}>
                                  <Link
                                    to={prefix ? `/${prefix}/chat/${room.id}` : `chat/${room.id}`}
                                    className={roomRowLinkClass(room.id, "chat-list-row-indent")}
                                    aria-current={activeRoomId === room.id ? "page" : undefined}
                                  >
                                    {rowContent}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })
                  )}
                </ul>
              )}
            </section>
            <section className="chat-list-section">
              <div className="chat-list-section-header-wrap">
                <button
                  type="button"
                  className="chat-list-section-header"
                  onClick={() => setGroupSectionCollapsed((c) => !c)}
                  aria-expanded={!groupSectionCollapsed}
                >
                  {groupSectionCollapsed ? (
                    <ChevronRight className="chat-list-section-chevron" aria-hidden />
                  ) : (
                    <ChevronDown className="chat-list-section-chevron" aria-hidden />
                  )}
                  <span className="chat-list-section-title">{t("chat.sectionGroups")}</span>
                </button>
                {onCreateGroup ? (
                  <span className="chat-list-section-add-slot">
                    <button
                      type="button"
                      className="chat-list-section-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewGroupSelectedIds([]);
                        setNewGroupName("");
                        setNewGroupOpen(true);
                      }}
                      aria-label={t("chat.newGroup")}
                      title={t("chat.newGroup")}
                    >
                      <Plus className="chat-list-section-add-icon" aria-hidden />
                    </button>
                  </span>
                ) : null}
              </div>
              {!groupSectionCollapsed && (
                <ul className="chat-list-ul chat-list-group-tree">
                  {groupSectionEntries.map((entry) => {
                    const note = notes[entry.id] ?? "";
                    const isPinned = pinned.includes(entry.id);
                    const rowContent = (
                      <>
                        <div className="chat-list-row-body">
                          <p className="chat-list-row-title">{note || entry.displayName}</p>
                          {entry.room.lastMessage ? (
                            <p className="chat-list-row-preview">
                              {lastMessagePreview(entry.room.lastMessage)}
                            </p>
                          ) : (
                            <p className="chat-list-row-preview">{t("chat.noMessagesYet")}</p>
                          )}
                        </div>
                        <div className="chat-list-row-actions" onClick={(e) => e.preventDefault()}>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="chat-list-header-btn"
                            onClick={(e) => {
                              e.preventDefault();
                              togglePin(entry.id);
                            }}
                            aria-label={isPinned ? t("chat.unpin") : t("chat.pin")}
                            title={isPinned ? t("chat.unpin") : t("chat.pin")}
                          >
                            <Pin className={`chat-list-pin-icon ${isPinned ? "pinned" : ""}`} />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="chat-list-header-btn"
                                onClick={(e) => e.preventDefault()}
                                aria-label={t("chat.note")}
                              >
                                <MoreHorizontal className="chat-list-menu-icon" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  openNoteEditor(entry.id, note);
                                }}
                              >
                                <StickyNote className="chat-list-menu-item-icon" />
                                {note ? t("chat.editNote") : t("chat.addNote")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.preventDefault();
                                  togglePin(entry.id);
                                }}
                              >
                                {isPinned ? (
                                  <>
                                    <Pin className="chat-list-menu-item-icon chat-list-pin-icon pinned" />
                                    {t("chat.unpin")}
                                  </>
                                ) : (
                                  <>
                                    <Pin className="chat-list-menu-item-icon chat-list-pin-icon" />
                                    {t("chat.pin")}
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setDeleteGroupRoomId(entry.room.id);
                                }}
                              >
                                <Trash2 className="chat-list-menu-item-icon" />
                                {t("chat.deleteGroup")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    );
                    return (
                      <li key={entry.id}>
                        <Link
                          to={prefix ? `/${prefix}/chat/${entry.room.id}` : `chat/${entry.room.id}`}
                          className={roomRowLinkClass(entry.room.id)}
                          aria-current={activeRoomId === entry.room.id ? "page" : undefined}
                        >
                          {rowContent}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <Dialog open={editingNoteKey !== null} onOpenChange={(open) => !open && setEditingNoteKey(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("chat.note")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editingNoteValue}
            onChange={(e) => setEditingNoteValue(e.target.value)}
            placeholder={t("chat.note")}
            className="min-h-[80px] resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveNote();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNoteKey(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveNote}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteGroupRoomId !== null}
        onOpenChange={(open) => !open && setDeleteGroupRoomId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("chat.deleteRoomTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("chat.deleteRoomConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupRoomId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteGroupRoomId) deleteGroupMutation.mutate(deleteGroupRoomId);
              }}
              disabled={deleteGroupMutation.isPending}
            >
              {deleteGroupMutation.isPending ? t("common.loading") : t("chat.deleteRoomAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newGroupOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNewGroupOpen(false);
            setNewGroupSelectedIds([]);
            setNewGroupName("");
          }
        }}
      >
        <DialogContent className="chat-dialog-add-group">
          <DialogHeader>
            <DialogTitle>{t("chat.newGroupTitle")}</DialogTitle>
          </DialogHeader>
          <p className="chat-dialog-hint">{t("chat.newGroupAgentLimitHint")}</p>
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder={t("chat.newGroupNamePlaceholder")}
            className="chat-new-group-name-input"
          />
          <div className="chat-dialog-scroll">
            {agents.length === 0 ? (
              <p className="chat-room-empty-text">{t("chat.noAgents")}</p>
            ) : (
              <div className="chat-dialog-list">
                {agents.map((agent) => {
                  const isSelected = newGroupSelectedIds.includes(agent.id);
                  const atLimit = newGroupSelectedIds.length >= MAX_GROUP_AGENT_COUNT;
                  const disabled = !isSelected && atLimit;
                  return (
                    <label
                      key={agent.id}
                      className={`chat-add-group-option ${disabled ? "disabled" : ""}`}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={disabled}
                        onCheckedChange={(checked) => {
                          if (disabled && checked) return;
                          setNewGroupSelectedIds((prev) =>
                            checked
                              ? [...prev, agent.id]
                              : prev.filter((id) => id !== agent.id),
                          );
                        }}
                      />
                      <span className="chat-add-group-option-label">{agent.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewGroupOpen(false);
                setNewGroupSelectedIds([]);
                setNewGroupName("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                newGroupSelectedIds.length < 1 ||
                newGroupSelectedIds.length > MAX_GROUP_AGENT_COUNT ||
                createGroupPending
              }
              onClick={() => {
                if (!onCreateGroup || newGroupSelectedIds.length < 1) return;
                onCreateGroup(newGroupSelectedIds, newGroupName.trim() || null);
                setNewGroupOpen(false);
                setNewGroupSelectedIds([]);
                setNewGroupName("");
              }}
            >
              {createGroupPending ? t("common.loading") : t("chat.newGroupConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
