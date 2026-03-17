import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../api/chat";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { PageSkeleton } from "../components/PageSkeleton";
import { InlineEntitySelector, type InlineEntityOption } from "@/components/InlineEntitySelector";
import { Button } from "@/components/ui/button";
import { MarkdownEditor, type MentionOption } from "@/components/MarkdownEditor";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AgentIcon } from "@/components/AgentIconPicker";
import { MessageCircle, X, UserPlus, Square } from "lucide-react";
import type { ChatMessage } from "@paperclipai/shared";
import { MAX_GROUP_AGENT_COUNT } from "@paperclipai/shared";
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
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

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
  const { orderedProjects } = useProjectOrder({
    projects: projectsList ?? [],
    companyId: selectedCompanyId,
    userId: undefined,
  });
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

  /** 群組聊天時，@ 標記僅能標記「此群組內的 AI」；direct 時不顯示 mention（由外層傳 []）。 */
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const roomAgentIds = new Set(
      (roomDetail?.members ?? [])
        .filter((m) => m.memberType === "agent")
        .map((m) => m.memberId),
    );
    return [...(agents ?? [])]
      .filter((a) => a.status !== "terminated" && roomAgentIds.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => ({ id: `agent:${a.id}`, name: a.name, kind: "agent" as const }));
  }, [agents, roomDetail?.members]);

  const addMessage = useMutation({
    mutationFn: ({ text, projectId }: { text: string; projectId?: string | null }) =>
      chatApi.addMessage(selectedCompanyId!, roomId!, text, projectId || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.messages(selectedCompanyId!, roomId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chat.activeRuns(selectedCompanyId!, roomId!),
      });
      setBody("");
    },
  });

  /** AI 運行中時改為顯示「停止」按鈕，可即時取消目前 run。 */
  const isRunning = Boolean(activeRuns && activeRuns.length > 0);
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

  const isDirect = roomDetail?.room?.type === "direct";
  const currentAgentId = useMemo(() => {
    const agentMember = roomDetail?.members?.find((m) => m.memberType === "agent");
    return agentMember?.memberId ?? null;
  }, [roomDetail?.members]);

  const agentsForGroup = useMemo(() => {
    return [...(agents ?? [])]
      .filter((a) => a.status !== "terminated" && a.id !== currentAgentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, currentAgentId]);

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
    setBreadcrumbs([
      { label: t("chat.title") },
      { label: titleName },
    ]);
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
        <div className="chat-room-composer-row">
          <div className="chat-room-composer-editor-wrap">
            <MarkdownEditor
              value={body}
              onChange={setBody}
              placeholder={
                isDirect ? t("chat.placeholderDirect") : t("chat.placeholder")
              }
              mentions={isDirect ? [] : mentionOptions}
              onSubmit={() => {
                const trimmed = body.trim();
                if (trimmed) addMessage.mutate({ text: trimmed, projectId: selectedProjectId || null });
              }}
            />
          </div>
          <Button
            onClick={() => {
              if (isRunning && activeRuns?.[0]?.id) {
                cancelRun.mutate(activeRuns[0].id);
              } else {
                const trimmed = body.trim();
                if (trimmed) addMessage.mutate({ text: trimmed, projectId: selectedProjectId || null });
              }
            }}
            disabled={
              isRunning
                ? cancelRun.isPending
                : !body.trim() || addMessage.isPending
            }
            variant={isRunning ? "destructive" : "default"}
            aria-label={isRunning ? t("chat.stop") : t("chat.send")}
          >
            {isRunning ? (
              <>
                <Square className="chat-composer-stop-icon" aria-hidden />
                {cancelRun.isPending ? t("chat.stopping") : t("chat.stop")}
              </>
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
            onChange={setSelectedProjectId}
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
    </div>
  );
}

/** AI 輸入中／思考中氣泡：頭貼在左、名稱在氣泡上方靠左，版面參考 LINE。 */
function ChatTypingBubble({
  agentName,
  bubbleStyle,
}: {
  agentName?: string;
  bubbleStyle: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const displayName = agentName?.trim() || "";
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
          <span>{t("chat.typing")}</span>
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
