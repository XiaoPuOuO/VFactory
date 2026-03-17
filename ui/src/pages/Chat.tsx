import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, Outlet, useParams } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "../api/chat";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ApiError } from "../api/client";
import { ChatList } from "../components/ChatList";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { MessageCircle } from "lucide-react";
import "../styles/chat.css";

/**
 * 聊天頁：左欄人員/房間列表，右欄為 Outlet（未選＝ChatEmpty「開始聊天吧」，選取＝ChatRoom 對話）。
 * 點開對話時對話顯示在右側，不另開頁。
 */
export function Chat() {
  const { t } = useTranslation();
  const { roomId } = useParams<{ roomId?: string }>();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefix = selectedCompany?.issuePrefix ?? "";

  /** 未選對話（index）時麵包屑只顯示「聊天」；選了房間時由 ChatRoom 設定「聊天 > 房間名」。關閉對話回到 index 時需重設。 */
  useEffect(() => {
    if (!roomId) {
      setBreadcrumbs([{ label: t("chat.title") }]);
    }
  }, [roomId, setBreadcrumbs, t]);

  const { data: rooms, isLoading: isLoadingRooms } = useQuery({
    queryKey: queryKeys.chat.rooms(selectedCompanyId!),
    queryFn: () => chatApi.listRooms(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents, isLoading: isLoadingAgents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createDirect = useMutation({
    mutationFn: (payload: string | { agentId: string; name: string }) => {
      if (typeof payload === "string") {
        return chatApi.createDirectRoom(selectedCompanyId!, payload);
      }
      return chatApi.createDirectRoom(selectedCompanyId!, payload.agentId, payload.name);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms(selectedCompanyId!) });
      if (prefix) {
        navigate(`/${prefix}/chat/${data.room.id}`);
      } else {
        navigate(`chat/${data.room.id}`);
      }
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : t("chat.openChatFailed");
      pushToast({ title: message, tone: "error" });
    },
  });

  const createGroup = useMutation({
    mutationFn: ({ agentIds, name }: { agentIds: string[]; name?: string | null }) =>
      chatApi.createGroupRoom(selectedCompanyId!, agentIds, name ?? null),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms(selectedCompanyId!) });
      if (prefix) {
        navigate(`/${prefix}/chat/${data.room.id}`);
      } else {
        navigate(`chat/${data.room.id}`);
      }
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : t("chat.openChatFailed");
      pushToast({ title: message, tone: "error" });
    },
  });

  const activeAgents = (agents ?? []).filter((a) => a.status !== "terminated");

  const onAfterDeleteGroup = useCallback(
    (deletedRoomId: string) => {
      if (roomId === deletedRoomId && prefix) navigate(`/${prefix}/chat`);
      else if (roomId === deletedRoomId) navigate("/chat");
    },
    [roomId, prefix, navigate],
  );

  if (!selectedCompanyId) {
    return (
      <div className="chat-page-empty-wrap">
        <div className="chat-page-empty-inner">
          <EmptyState
            icon={MessageCircle}
            message={t("chat.selectCompany")}
          />
        </div>
      </div>
    );
  }

  const showListSkeleton = isLoadingAgents && !agents;

  return (
    <div className="chat-page">
      <div className="chat-list-panel">
        {showListSkeleton ? (
          <PageSkeleton />
        ) : (
          <ChatList
            rooms={rooms}
            agents={activeAgents}
            isLoadingRooms={isLoadingRooms}
            onCreateDirect={(agentId) => createDirect.mutate(agentId)}
            onCreateDirectWithName={(agentId, name) =>
              createDirect.mutate({ agentId, name })
            }
            createDirectPending={createDirect.isPending}
            onCreateGroup={(agentIds, name) =>
              createGroup.mutate({ agentIds, name })
            }
            createGroupPending={createGroup.isPending}
            onAfterDeleteGroup={onAfterDeleteGroup}
          />
        )}
      </div>
      <div className="chat-main-panel">
        <Outlet />
      </div>
    </div>
  );
}
