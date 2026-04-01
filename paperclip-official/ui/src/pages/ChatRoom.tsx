import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../api/chat";
import { companySkillsApi } from "../api/companySkills";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { assetsApi } from "../api/assets";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { PageSkeleton } from "../components/PageSkeleton";
import { InlineEntitySelector, type InlineEntityOption } from "@/components/InlineEntitySelector";
import { Button } from "@/components/ui/button";
import { MarkdownEditor, type MentionOption, type SlashWorkflowOption } from "@/components/MarkdownEditor";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AgentIcon } from "@/components/AgentIconPicker";
import { MessageCircle, X, UserPlus, Square, Paperclip, Users } from "lucide-react";
import { ChatGroupMembersDialog } from "@/components/ChatGroupMembersDialog";
import type { ChatMessage } from "@paperclipai/shared";
import { MAX_GROUP_AGENT_COUNT } from "@paperclipai/shared";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "../context/ThemeContext";
import {
  extractIssueIdentifiers,
  ChatMessageIssueRunCard,
} from "@/components/ChatMessageIssueRunCard";
import { useChatComposerPipeline } from "../hooks/useChatComposerPipeline";
import { ChatComposerQueue, type ChatQueuedDraft } from "@/components/ChatComposerQueue";

const MESSAGES_PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 4000;
const ACTIVE_RUNS_POLL_MS = 3000;

/** 標題列空間大，約可顯示 10+ 個名稱後再省略。群組含 Board（董事長/Board）+ AI。 */
const GROUP_NAME_MAX_VISIBLE = 200;

function roomDisplayName(
  room: { type: string; name: string | null } | undefined,
  members: Array<{ memberType: string; agentName?: string | null; memberId?: string }>,
  boardLabel: string,
): string {
  if (!room) return "";
  if (room.type === "group" && room.name) return room.name;
  if (room.type !== "group") {
    const agentMember = members.find((m) => m.memberType === "agent");
    return agentMember?.agentName ?? "";
  }
  const userMembers = members.filter((m) => m.memberType === "user");
  const agentMembers = members.filter((m) => m.memberType === "agent");
  const userNames = userMembers.map(() => boardLabel);
  const agentNames = agentMembers.map((m) => m.agentName ?? m.memberId?.slice(0, 8) ?? "");
  const names = [...userNames, ...agentNames];
  const n = members.length;
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

export function ChatRoom() {
  const { t } = useTranslation();
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const prefix = selectedCompany?.issuePrefix ?? "";
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const [body, setBody] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  /** 管線忙碌時新訊息進入 FIFO；管線空時 debounce 自動送第一則 */
  const [queuedMessages, setQueuedMessages] = useState<ChatQueuedDraft[]>([]);
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  const { data: roomDetail, isLoading: roomLoading } = useQuery({
    queryKey: queryKeys.chat.room(selectedCompanyId!, roomId!),
    queryFn: () => chatApi.getRoom(selectedCompanyId!, roomId!),
    enabled: !!selectedCompanyId && !!roomId,
  });

  const {
    data: messages,
    isLoading: messagesLoading,
  } = useQuery({
    queryKey: queryKeys.chat.messages(selectedCompanyId!, roomId!),
    queryFn: () =>
      chatApi.listMessages(selectedCompanyId!, roomId!, { limit: MESSAGES_PAGE_SIZE }),
    enabled: !!selectedCompanyId && !!roomId,
  });

  const { data: activeRuns } = useQuery({
    queryKey: queryKeys.chat.activeRuns(selectedCompanyId!, roomId!),
    queryFn: () => chatApi.getActiveRuns(selectedCompanyId!, roomId!),
    enabled: !!selectedCompanyId && !!roomId,
  });

  const { isPipelineBusy, chatRunBusy } = useChatComposerPipeline({
    issuePrefix: prefix,
    messages,
    activeChatRuns: activeRuns,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projectsList } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && !!roomId,
  });

  const { data: companySkillsList } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId!),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { orderedProjects } = useProjectOrder({
    projects: projectsList ?? [],
    companyId: selectedCompanyId,
    userId: undefined,
  });

  const patchComposerProject = useMutation({
    mutationFn: (composerProjectId: string | null) =>
      chatApi.updateRoom(selectedCompanyId!, roomId!, { composerProjectId }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.chat.room(selectedCompanyId!, roomId!), data);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.room(selectedCompanyId!, roomId!),
      });
    },
  });

  /**
   * 從伺服器還原此聊天室儲存的「針對專案」選取。
   * `composerProjectId` 須列入 effect 依賴：重新開啟聊天或房間資料 refetch 後，才能用伺服器值還原選取。
   * 若 `patchComposerProject`（PATCH）仍在進行中則提早返回，略過 `setSelectedProjectId`，避免尚未完成的更新被覆寫造成競態。
   */
  useEffect(() => {
    if (!roomDetail?.room || roomDetail.room.id !== roomId) return;
    if (patchComposerProject.isPending) return;
    setSelectedProjectId(roomDetail.room.composerProjectId ?? "");
  }, [
    roomId,
    roomDetail?.room?.id,
    roomDetail?.room?.composerProjectId,
    patchComposerProject.isPending,
  ]);

  /** 專案被封存或刪除後不再出現在列表時，清除「針對專案」選取，並同步清除伺服器儲存。 */
  useEffect(() => {
    if (!selectedProjectId) return;
    if (projectsList === undefined) return;
    if (!orderedProjects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId("");
      if (selectedCompanyId && roomId) {
        patchComposerProject.mutate(null);
      }
    }
  }, [
    orderedProjects,
    selectedProjectId,
    projectsList,
    selectedCompanyId,
    roomId,
    patchComposerProject,
  ]);

  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [orderedProjects],
  );
  const selectedProject = orderedProjects.find((p) => p.id === selectedProjectId);

  const projectLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of orderedProjects) {
      m.set(p.id, p.name);
    }
    return m;
  }, [orderedProjects]);

  /** 群組聊天時，@ 標記僅能標記「此群組內的 AI」；含 @everyone 以同時標註群內全部 AI。direct 時不顯示 mention（由外層傳 []）。 */
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const roomAgentIds = new Set(
      (roomDetail?.members ?? [])
        .filter((m) => m.memberType === "agent")
        .map((m) => m.memberId),
    );
    const agentOptions = [...(agents ?? [])]
      .filter((a) => a.status !== "terminated" && roomAgentIds.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ id: `agent:${a.id}`, name: a.name, kind: "agent" as const }));
    if (agentOptions.length === 0) return [];
    const everyoneOption: MentionOption = {
      id: "special:everyone",
      name: "everyone",
      kind: "agent",
    };
    return [everyoneOption, ...agentOptions];
  }, [agents, roomDetail?.members]);

  /** 群組與 1:1 皆顯示：可手動 `/` 觸發的工作流程（與 @ 不同，不依 isDirect 清空）。 */
  const slashWorkflowOptions = useMemo<SlashWorkflowOption[]>(() => {
    const skills = companySkillsList?.skills ?? [];
    const argsNone = t("chat.slashWorkflowArgsNone");
    return skills
      .filter((s) => s.isManualSlashWorkflow === true)
      .map((s) => {
        const parsed = safeParseSkillFrontmatterFromMarkdown(s.skillMarkdown);
        const args = parsed.success ? (parsed.data.arguments ?? []) : [];
        const argsHint =
          args.length === 0
            ? argsNone
            : args
                .slice(0, 2)
                .map((a) => `${(a.label ?? a.name).trim()} → {{${a.name}}}${a.required ? "*" : ""}`)
                .join(" · ") + (args.length > 2 ? " …" : "");

        return {
          key: s.key,
          name: s.name,
          description: s.description,
          argsHint,
        };
      });
  }, [companySkillsList, t]);

  const addMessage = useMutation({
    mutationFn: ({
      text,
      projectId,
    }: {
      text: string;
      projectId?: string | null;
      queueItemId?: string | null;
    }) => chatApi.addMessage(selectedCompanyId!, roomId!, text, projectId || undefined),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages(selectedCompanyId!, roomId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.activeRuns(selectedCompanyId!, roomId!),
      });
      void queryClient.invalidateQueries({ queryKey: ["issues", "active-run"] });
      setBody("");
      if (vars.queueItemId) {
        setQueuedMessages((q) => q.filter((x) => x.id !== vars.queueItemId));
      }
    },
  });

  useEffect(() => {
    setQueuedMessages([]);
    setQueueCollapsed(false);
  }, [roomId, selectedCompanyId]);

  /** 佇列第一則：管線空、debounce，避免編輯佇列時立刻送出 */
  useEffect(() => {
    if (!selectedCompanyId || !roomId) return;
    if (isPipelineBusy || queuedMessages.length === 0) return;
    const first = queuedMessages[0];
    if (!first.text.trim() || addMessage.isPending) return;
    const t = window.setTimeout(() => {
      addMessage.mutate({
        text: first.text.trim(),
        projectId: first.projectId,
        queueItemId: first.id,
      });
    }, 480);
    return () => window.clearTimeout(t);
  }, [isPipelineBusy, queuedMessages, addMessage.mutate, addMessage.isPending, selectedCompanyId, roomId]);

  const trySendOrQueue = () => {
    const trimmed = body.trim();
    if (!trimmed || addMessage.isPending) return;
    if (isPipelineBusy) {
      setQueuedMessages((q) => [
        ...q,
        { id: crypto.randomUUID(), text: trimmed, projectId: selectedProjectId || null },
      ]);
      setBody("");
      return;
    }
    addMessage.mutate({ text: trimmed, projectId: selectedProjectId || null });
  };

  const sendQueuedNow = (id: string) => {
    if (isPipelineBusy || addMessage.isPending) return;
    const item = queuedMessages.find((x) => x.id === id);
    if (!item?.text.trim()) return;
    addMessage.mutate({
      text: item.text.trim(),
      projectId: item.projectId,
      queueItemId: id,
    });
  };

  /** 聊天室 taskKey=chat:room 的 run（顯示「停止」與 typing）。Issue 後續 run 不顯示停止，但會納入 isPipelineBusy。 */
  const isRunning = chatRunBusy;
  const cancelRun = useMutation({
    mutationFn: (runId: string) => heartbeatsApi.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.activeRuns(selectedCompanyId!, roomId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages(selectedCompanyId!, roomId!),
      });
    },
  });

  const uploadChatImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, `chat/${roomId ?? "draft"}`);
    },
  });

  const isDirect = roomDetail?.room?.type === "direct";
  const isGroup = roomDetail?.room?.type === "group";
  const currentAgentId = useMemo(() => {
    const agentMember = roomDetail?.members?.find((m) => m.memberType === "agent");
    return agentMember?.memberId ?? null;
  }, [roomDetail?.members]);

  const agentsForGroup = useMemo(() => {
    return [...(agents ?? [])]
      .filter((a) => a.status !== "terminated" && a.id !== currentAgentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, currentAgentId]);

  const groupAgentMemberIds = useMemo(() => {
    return (roomDetail?.members ?? [])
      .filter((m) => m.memberType === "agent")
      .map((m) => m.memberId);
  }, [roomDetail?.members]);

  const createGroupMutation = useMutation({
    mutationFn: (agentIds: string[]) =>
      chatApi.createGroupRoom(selectedCompanyId!, agentIds, null),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chat.rooms(selectedCompanyId!),
      });
      setAddToGroupOpen(false);
      setSelectedAgentIds([]);
      const path = prefix ? `/${prefix}/chat/${data.room.id}` : `chat/${data.room.id}`;
      navigate(path);
    },
  });

  const updateMembersMutation = useMutation({
    mutationFn: (payload: { addAgentIds?: string[]; removeAgentIds?: string[] }) =>
      chatApi.updateRoomMembers(selectedCompanyId!, roomId!, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.chat.room(selectedCompanyId!, roomId!), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.room(selectedCompanyId!, roomId!) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms(selectedCompanyId!) });
      setManageMembersOpen(false);
    },
  });

  const displayName = roomDisplayName(
    roomDetail?.room,
    roomDetail?.members ?? [],
    t("chat.boardLabel"),
  );

  const { data: listPreferences } = useQuery({
    queryKey: queryKeys.chat.listPreferences(selectedCompanyId ?? ""),
    queryFn: () => chatApi.getListPreferences(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const note = roomId ? listPreferences?.notes?.[roomId] : undefined;
  const titleName = note || displayName || roomId?.slice(0, 8) || "";

  useEffect(() => {
    const trimmedTitle = titleName.trim();
    if (trimmedTitle) {
      setBreadcrumbs([
        { label: t("chat.title") },
        { label: trimmedTitle },
      ]);
    } else {
      setBreadcrumbs([{ label: t("chat.title") }]);
    }
  }, [setBreadcrumbs, t, titleName]);

  useEffect(() => {
    if (messages && messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!selectedCompanyId || !roomId) {
    return null;
  }

  if (roomLoading || !roomDetail) {
    return <PageSkeleton />;
  }

  return (
    <div className="chat-room-root">
      <div className="chat-room-header">
        <span className="chat-room-header-label">{t("chat.title")}</span>
        <span className="chat-room-header-label">/</span>
        <span className="chat-room-header-title">
          {titleName}
        </span>
        {isDirect && currentAgentId && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="chat-room-header-btn"
            onClick={() => setAddToGroupOpen(true)}
            aria-label={t("chat.addToGroup")}
            title={t("chat.addToGroup")}
          >
            <UserPlus />
          </Button>
        )}
        {isGroup && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="chat-room-header-btn"
            onClick={() => setManageMembersOpen(true)}
            aria-label={t("chat.manageMembers")}
            title={t("chat.manageMembers")}
          >
            <Users />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="chat-room-header-btn"
          onClick={() => navigate("..")}
          aria-label={t("chat.closeChat")}
          title={t("chat.closeChat")}
        >
          <X />
        </Button>
      </div>

      <div ref={scrollRef} className="chat-room-messages">
        {messagesLoading ? (
          <div className="chat-room-messages-loading">{t("common.loading")}</div>
        ) : !messages || messages.length === 0 ? (
          activeRuns && activeRuns.length > 0 ? (
            <div className="chat-room-messages-list">
              {activeRuns.map((run) => (
                <ChatTypingBubble
                  key={run.id}
                  agentName={run.agentName ?? undefined}
                  startedAt={run.startedAt}
                  createdAt={run.createdAt}
                  bubbleStyle={
                    theme === "dark"
                      ? { backgroundColor: "#e5e7eb", color: "#111827" }
                      : { backgroundColor: "#374151", color: "#f9fafb" }
                  }
                />
              ))}
            </div>
          ) : (
            <div className="chat-room-empty-state">
              <MessageCircle className="chat-room-empty-icon" />
              <p className="chat-room-empty-text">
                {isDirect ? t("chat.emptyRoomDirect") : t("chat.emptyRoom")}
              </p>
            </div>
          )
        ) : (
          <div className="chat-room-messages-list">
            {[...messages].reverse().map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                companyId={selectedCompanyId ?? ""}
                issuePrefix={selectedCompany?.issuePrefix ?? ""}
                urlPrefix={prefix || undefined}
              />
            ))}
            {activeRuns &&
              activeRuns.length > 0 &&
              activeRuns.map((run) => (
                <ChatTypingBubble
                  key={run.id}
                  agentName={run.agentName ?? undefined}
                  startedAt={run.startedAt}
                  createdAt={run.createdAt}
                  bubbleStyle={
                    theme === "dark"
                      ? { backgroundColor: "#e5e7eb", color: "#111827" }
                      : { backgroundColor: "#374151", color: "#f9fafb" }
                  }
                />
              ))}
          </div>
        )}
      </div>

      <div className="chat-room-composer">
        <ChatComposerQueue
          items={queuedMessages}
          collapsed={queueCollapsed}
          onCollapsedChange={setQueueCollapsed}
          onUpdateItem={(id, patch) => {
            setQueuedMessages((q) =>
              q.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            );
          }}
          onRemoveItem={(id) => setQueuedMessages((q) => q.filter((x) => x.id !== id))}
          onSendNow={sendQueuedNow}
          isPipelineBusy={isPipelineBusy}
          isSending={addMessage.isPending}
          mentionOptions={isDirect ? [] : mentionOptions}
          slashWorkflows={slashWorkflowOptions}
          projectLabelById={projectLabelById}
        />
        <div className="chat-room-composer-row">
          <div className="chat-room-composer-editor-wrap">
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder={
                isPipelineBusy
                  ? t("chat.followUpPlaceholder")
                  : isDirect
                    ? t("chat.placeholderDirect")
                    : t("chat.placeholder")
              }
              mentions={isDirect ? [] : mentionOptions}
              slashWorkflows={slashWorkflowOptions}
              onSubmit={trySendOrQueue}
              imageUploadHandler={async (file) => {
                const asset = await uploadChatImage.mutateAsync(file);
                return asset.contentPath;
              }}
            />
          </div>
          <div className="chat-room-composer-actions">
            <input
              ref={fileInputRef}
              type="file"
              className="chat-room-file-input"
              onChange={async (evt) => {
                const file = evt.target.files?.[0];
                if (!file) return;
                try {
                  const asset = await uploadChatImage.mutateAsync(file);
                  const name = file.name || "attachment";
                  const ct = (asset.contentType || "").toLowerCase();
                  const isImage = ct.startsWith("image/");
                  const suffix = isImage
                    ? `![${name}](${asset.contentPath})`
                    : `[${name}](${asset.contentPath})`;
                  setBody((prev) => (prev ? `${prev}\n\n${suffix}` : suffix));
                } finally {
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="chat-room-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadChatImage.isPending}
              aria-label={t("chatIssue.attachImageFromChat") ?? "Attach file"}
              title={t("chatIssue.attachImageFromChat") ?? "Attach file"}
            >
              <Paperclip className="chat-room-attach-icon" aria-hidden />
            </Button>
          </div>
          <Button
            onClick={() => {
              if (isRunning && activeRuns?.[0]?.id) {
                cancelRun.mutate(activeRuns[0].id);
              } else {
                trySendOrQueue();
              }
            }}
            disabled={
              isRunning
                ? cancelRun.isPending
                : !body.trim() || addMessage.isPending
            }
            variant={
              isRunning
                ? "destructive"
                : isPipelineBusy && queuedMessages.length > 0
                  ? "secondary"
                  : "default"
            }
            aria-label={isRunning ? t("chat.stop") : t("chat.send")}
          >
            {isRunning ? (
              <>
                <Square className="chat-composer-stop-icon" aria-hidden />
                {cancelRun.isPending ? t("chat.stopping") : t("chat.stop")}
              </>
            ) : isPipelineBusy ? (
              t("chat.enqueueSend")
            ) : (
              t("chat.send")
            )}
          </Button>
        </div>
        <div className="chat-room-project-row">
          <span className="chat-room-project-label">{t("chat.projectScope")}</span>
          <InlineEntitySelector
            value={selectedProjectId}
            options={projectOptions}
            placeholder={t("chat.projectScopePlaceholder")}
            noneLabel={t("chat.noProject")}
            searchPlaceholder={t("chat.searchProjects")}
            emptyMessage={t("chat.noProjectsFound")}
            onChange={(id) => {
              setSelectedProjectId(id);
              if (selectedCompanyId && roomId) {
                patchComposerProject.mutate(id || null);
              }
            }}
            className="chat-room-project-select"
            disablePortal
            renderTriggerValue={(option) =>
              option && selectedProject ? (
                <span className="chat-project-trigger-value">
                  <span
                    className="chat-project-trigger-dot"
                    style={{ backgroundColor: selectedProject.color ?? "#6366f1" }}
                  />
                  <span>{selectedProject.name}</span>
                </span>
              ) : (
                <span className="chat-project-trigger-placeholder">{t("chat.noProject")}</span>
              )
            }
          />
        </div>
      </div>

      <Dialog open={addToGroupOpen} onOpenChange={setAddToGroupOpen}>
        <DialogContent className="chat-dialog-add-group">
          <DialogHeader>
            <DialogTitle>{t("chat.addToGroupTitle")}</DialogTitle>
          </DialogHeader>
          <p className="chat-dialog-hint">{t("chat.groupAgentLimitHint")}</p>
          <div className="chat-dialog-scroll">
            {agentsForGroup.length === 0 ? (
              <p className="chat-room-empty-text">{t("chat.noAgents")}</p>
            ) : (
              <div className="chat-dialog-list">
                {agentsForGroup.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  const atLimit = selectedAgentIds.length >= MAX_GROUP_AGENT_COUNT - 1;
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
                          setSelectedAgentIds((prev) =>
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
              onClick={() => setAddToGroupOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!currentAgentId) return;
                const agentIds = [currentAgentId, ...selectedAgentIds];
                createGroupMutation.mutate(agentIds);
              }}
              disabled={
                selectedAgentIds.length === 0 ||
                selectedAgentIds.length > MAX_GROUP_AGENT_COUNT - 1 ||
                createGroupMutation.isPending
              }
            >
              {createGroupMutation.isPending
                ? t("common.loading")
                : t("chat.addToGroupConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChatGroupMembersDialog
        open={manageMembersOpen}
        onOpenChange={setManageMembersOpen}
        agents={agents}
        groupAgentMemberIds={groupAgentMemberIds}
        maxAgents={MAX_GROUP_AGENT_COUNT}
        onSave={(payload) => updateMembersMutation.mutate(payload)}
        isPending={updateMembersMutation.isPending}
      />
    </div>
  );
}

/** AI 輸入中／思考中氣泡：頭貼在左、名稱在氣泡上方靠左，版面參考 LINE。 */
function ChatTypingBubble({
  agentName,
  startedAt,
  createdAt,
  bubbleStyle,
}: {
  agentName?: string;
  startedAt?: string | null;
  createdAt?: string;
  bubbleStyle: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const displayName = agentName?.trim() || "";
  const [durationStr, setDurationStr] = useState("");

  useEffect(() => {
    const startTimeStr = startedAt || createdAt;
    if (!startTimeStr) {
      setDurationStr("");
      return;
    }
    const start = new Date(startTimeStr).getTime();
    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, now - start);
      const secs = Math.floor(diff / 1000);
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      setDurationStr(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt, createdAt]);

  return (
    <div className="chat-bubble-row">
      {displayName && (
        <Avatar size="sm" className="chat-bubble-avatar">
          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
            {initials(displayName)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="chat-bubble-main">
        {displayName && (
          <span className="chat-bubble-author-name" aria-hidden>
            {displayName}
          </span>
        )}
        <div className="chat-typing-bubble" style={bubbleStyle}>
          <span>{durationStr ? `${t("chat.working", { defaultValue: "工作中" })}：${durationStr}` : t("chat.typing")}</span>
          <span className="chat-typing-dot" aria-hidden />
          <span className="chat-typing-dot" aria-hidden />
          <span className="chat-typing-dot" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function formatMessageTime(createdAt: string): string {
  const d = new Date(createdAt);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function ChatMessageBubble({
  message,
  companyId,
  issuePrefix,
  urlPrefix,
}: {
  message: ChatMessage;
  companyId: string;
  issuePrefix: string;
  urlPrefix?: string;
}) {
  const isAgent = !!message.authorAgentId;
  const { theme } = useTheme();
  const dark = theme === "dark";
  const timeStr = formatMessageTime(message.createdAt);

  const issueIds =
    isAgent && issuePrefix
      ? extractIssueIdentifiers(message.body, issuePrefix)
      : [];

  const bubbleStyle: React.CSSProperties =
    dark
      ? { backgroundColor: "#e5e7eb", color: "#111827" }
      : { backgroundColor: "#374151", color: "#f9fafb" };

  const bubble = (
    <div className="chat-bubble-wrap">
      <div className="chat-bubble-content" style={bubbleStyle}>
        <MarkdownBody className="!text-inherit [&_*]:!text-inherit">
          {message.body}
        </MarkdownBody>
        {issueIds.length > 0 && (
          <div className="chat-bubble-issue-cards">
            {issueIds.map((id) => (
              <ChatMessageIssueRunCard
                key={id}
                companyId={companyId}
                issueIdentifier={id}
                urlPrefix={urlPrefix}
              />
            ))}
          </div>
        )}
      </div>
      <span className="chat-bubble-time">{timeStr}</span>
    </div>
  );

  if (isAgent) {
    const avatarOrIcon =
      message.authorAgentIcon != null && message.authorAgentIcon !== "" ? (
        <div className="chat-bubble-avatar chat-bubble-avatar-icon" aria-hidden>
          <AgentIcon icon={message.authorAgentIcon} className="chat-bubble-agent-icon" />
        </div>
      ) : (
        <Avatar size="sm" className="chat-bubble-avatar">
          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
            {message.authorAgentName ? initials(message.authorAgentName) : "AI"}
          </AvatarFallback>
        </Avatar>
      );
    const displayName = message.authorAgentName?.trim() || "AI";
    return (
      <div className="chat-bubble-row">
        {avatarOrIcon}
        <div className="chat-bubble-main">
          <span className="chat-bubble-author-name" aria-hidden>
            {displayName}
          </span>
          {bubble}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-bubble-row-user">
      {bubble}
    </div>
  );
}
