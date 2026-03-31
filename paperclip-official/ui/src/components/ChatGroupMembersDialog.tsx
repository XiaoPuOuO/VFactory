import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "@paperclipai/shared";
import { AgentIcon } from "@/components/AgentIconPicker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import "./ChatGroupMembersDialog.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function agentSubtitle(agent: Agent): string {
  const t = agent.title?.trim();
  if (t) return t;
  return agent.role;
}

function matchesSearch(agent: Agent, q: string): boolean {
  if (!q) return true;
  const n = q.toLowerCase();
  if (agent.name.toLowerCase().includes(n)) return true;
  if (agent.title?.toLowerCase().includes(n)) return true;
  if (String(agent.role).toLowerCase().includes(n)) return true;
  return false;
}

export interface ChatGroupMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[] | undefined;
  /** 群組內目前 AI 成員 id（不含 board） */
  groupAgentMemberIds: string[];
  maxAgents: number;
  onSave: (payload: { addAgentIds?: string[]; removeAgentIds?: string[] }) => void;
  isPending: boolean;
}

export function ChatGroupMembersDialog({
  open,
  onOpenChange,
  agents,
  groupAgentMemberIds,
  maxAgents,
  onSave,
  isPending,
}: ChatGroupMembersDialogProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [removeMemberIds, setRemoveMemberIds] = useState<string[]>([]);
  const [addMemberIds, setAddMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setRemoveMemberIds([]);
      setAddMemberIds([]);
    }
  }, [open]);

  const groupAgentMembers = useMemo(() => {
    const ids = new Set(groupAgentMemberIds);
    return [...(agents ?? [])]
      .filter((a) => ids.has(a.id) && a.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, groupAgentMemberIds]);

  const groupAddableAgents = useMemo(() => {
    const ids = new Set(groupAgentMemberIds);
    return [...(agents ?? [])]
      .filter((a) => a.status !== "terminated" && !ids.has(a.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, groupAgentMemberIds]);

  const q = searchQuery.trim().toLowerCase();
  const filteredCurrent = useMemo(
    () => groupAgentMembers.filter((a) => matchesSearch(a, q)),
    [groupAgentMembers, q],
  );
  const filteredAddable = useMemo(
    () => groupAddableAgents.filter((a) => matchesSearch(a, q)),
    [groupAddableAgents, q],
  );

  const effectiveStayingCount = groupAgentMembers.length - removeMemberIds.length;
  const projectedTotal =
    groupAgentMembers.length - removeMemberIds.length + addMemberIds.length;
  const atLimit = projectedTotal >= maxAgents;

  const hasChanges = removeMemberIds.length > 0 || addMemberIds.length > 0;

  const changesSummary =
    removeMemberIds.length > 0 || addMemberIds.length > 0
      ? t("chat.manageMembersChangesSummary", {
          remove: removeMemberIds.length,
          add: addMemberIds.length,
        })
      : "";

  const showNoResults =
    q.length > 0 && filteredCurrent.length === 0 && filteredAddable.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="chat-group-members-dialog">
        <DialogHeader>
          <DialogTitle>{t("chat.manageMembersTitle")}</DialogTitle>
        </DialogHeader>
        <p className="chat-group-members-hint">{t("chat.groupAgentLimitHint")}</p>

        <div className="chat-group-members-search-wrap">
          <Search className="chat-group-members-search-icon" aria-hidden size={18} />
          <Input
            className="chat-group-members-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("chat.manageMembersSearchPlaceholder")}
            aria-label={t("chat.manageMembersSearchPlaceholder")}
            autoComplete="off"
          />
        </div>

        <div className="chat-group-members-scroll">
          {showNoResults ? (
            <p className="chat-group-members-empty">{t("chat.manageMembersNoResults")}</p>
          ) : (
            <>
              <div className="chat-group-members-section">
                <h3 className="chat-group-members-section-title">{t("chat.currentMembers")}</h3>
                {groupAgentMembers.length === 0 ? (
                  <p className="chat-group-members-empty">{t("chat.noAgents")}</p>
                ) : filteredCurrent.length === 0 ? (
                  <p className="chat-group-members-empty">{t("chat.manageMembersNoResults")}</p>
                ) : (
                  <ul className="chat-group-members-list" role="list">
                    {filteredCurrent.map((agent) => {
                      const pendingRemove = removeMemberIds.includes(agent.id);
                      const canMarkRemove =
                        pendingRemove || effectiveStayingCount > 1;
                      const sub = agentSubtitle(agent);
                      return (
                        <li
                          key={agent.id}
                          className={`chat-group-members-row ${pendingRemove ? "chat-group-members-row--pending-remove" : ""}`}
                        >
                          <div className="chat-group-members-row-main">
                            {agent.icon ? (
                              <span className="chat-group-members-avatar-wrap">
                                <AgentIcon icon={agent.icon} className="chat-group-members-avatar-icon" />
                              </span>
                            ) : (
                              <Avatar className="chat-group-members-avatar-fallback">
                                <AvatarFallback className="chat-group-members-avatar-fallback-inner">
                                  {initials(agent.name)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="chat-group-members-row-text">
                              <span className="chat-group-members-row-name">{agent.name}</span>
                              {sub ? (
                                <span className="chat-group-members-row-sub">{sub}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="chat-group-members-row-actions">
                            {pendingRemove ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="chat-group-members-action"
                                onClick={() =>
                                  setRemoveMemberIds((prev) => prev.filter((id) => id !== agent.id))
                                }
                              >
                                {t("chat.undoRemove")}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="chat-group-members-action chat-group-members-action--destructive"
                                disabled={!canMarkRemove || isPending}
                                title={
                                  !canMarkRemove ? t("chat.manageMembersMinOneHint") : undefined
                                }
                                onClick={() => setRemoveMemberIds((prev) => [...prev, agent.id])}
                              >
                                {t("chat.removeMember")}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="chat-group-members-section">
                <h3 className="chat-group-members-section-title">{t("chat.addMembers")}</h3>
                {groupAddableAgents.length === 0 ? (
                  <p className="chat-group-members-empty">{t("chat.noAgents")}</p>
                ) : filteredAddable.length === 0 ? (
                  <p className="chat-group-members-empty">{t("chat.manageMembersNoResults")}</p>
                ) : (
                  <ul className="chat-group-members-list" role="list">
                    {filteredAddable.map((agent) => {
                      const pendingAdd = addMemberIds.includes(agent.id);
                      const addDisabled = !pendingAdd && atLimit;
                      const sub = agentSubtitle(agent);
                      return (
                        <li
                          key={agent.id}
                          className={`chat-group-members-row ${pendingAdd ? "chat-group-members-row--pending-add" : ""}`}
                        >
                          <div className="chat-group-members-row-main">
                            {agent.icon ? (
                              <span className="chat-group-members-avatar-wrap">
                                <AgentIcon icon={agent.icon} className="chat-group-members-avatar-icon" />
                              </span>
                            ) : (
                              <Avatar className="chat-group-members-avatar-fallback">
                                <AvatarFallback className="chat-group-members-avatar-fallback-inner">
                                  {initials(agent.name)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div className="chat-group-members-row-text">
                              <span className="chat-group-members-row-name">{agent.name}</span>
                              {sub ? (
                                <span className="chat-group-members-row-sub">{sub}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="chat-group-members-row-actions">
                            {pendingAdd ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="chat-group-members-action"
                                onClick={() =>
                                  setAddMemberIds((prev) => prev.filter((id) => id !== agent.id))
                                }
                              >
                                {t("chat.cancelAdd")}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="chat-group-members-action"
                                disabled={addDisabled || isPending}
                                title={addDisabled ? t("chat.manageMembersAtLimitHint") : undefined}
                                onClick={() => setAddMemberIds((prev) => [...prev, agent.id])}
                              >
                                {t("chat.addMember")}
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="chat-group-members-footer">
          {hasChanges ? (
            <p className="chat-group-members-summary" aria-live="polite">
              {changesSummary}
            </p>
          ) : null}
          <div className="chat-group-members-footer-buttons">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() =>
                onSave({
                  ...(addMemberIds.length > 0 ? { addAgentIds: addMemberIds } : {}),
                  ...(removeMemberIds.length > 0 ? { removeAgentIds: removeMemberIds } : {}),
                })
              }
              disabled={!hasChanges || isPending}
            >
              {isPending ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
