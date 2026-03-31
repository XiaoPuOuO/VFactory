import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Pencil, Trash2, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor, type MentionOption, type SlashWorkflowOption } from "@/components/MarkdownEditor";
import { cn } from "../lib/utils";

export type ChatQueuedDraft = {
  id: string;
  text: string;
  projectId: string | null;
};

type Props = {
  items: ChatQueuedDraft[];
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onUpdateItem: (id: string, patch: { text: string; projectId: string | null }) => void;
  onRemoveItem: (id: string) => void;
  onSendNow: (id: string) => void;
  isPipelineBusy: boolean;
  isSending: boolean;
  /** 與主輸入區相同，編輯佇列項時可 @ */
  mentionOptions: MentionOption[];
  /** 與主輸入區相同，編輯佇列項時可 `/` 選工作流程 */
  slashWorkflows: SlashWorkflowOption[];
  projectLabelById: Map<string, string>;
};

function previewText(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function ChatComposerQueue({
  items,
  collapsed,
  onCollapsedChange,
  onUpdateItem,
  onRemoveItem,
  onSendNow,
  isPipelineBusy,
  isSending,
  mentionOptions,
  slashWorkflows,
  projectLabelById,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ChatQueuedDraft | null>(null);
  const [editBody, setEditBody] = useState("");

  if (items.length === 0) return null;

  const openEdit = (item: ChatQueuedDraft) => {
    setEditing(item);
    setEditBody(item.text);
  };

  const saveEdit = () => {
    if (!editing) return;
    const trimmed = editBody.trim();
    if (!trimmed) return;
    onUpdateItem(editing.id, { text: trimmed, projectId: editing.projectId });
    setEditing(null);
  };

  return (
    <>
      <div className="chat-composer-queue">
        <button
          type="button"
          className="chat-composer-queue-header"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn("chat-composer-queue-chevron", collapsed && "chat-composer-queue-chevron-collapsed")}
            aria-hidden
          />
          <span className="chat-composer-queue-title">
            {t("chat.queueSectionTitle", { count: items.length })}
          </span>
        </button>
        {!collapsed && (
          <ul className="chat-composer-queue-list" role="list">
            {items.map((item, index) => (
              <li key={item.id} className="chat-composer-queue-item">
                <span className="chat-composer-queue-bullet" aria-hidden />
                <div className="chat-composer-queue-item-main">
                  <div className="chat-composer-queue-item-row">
                    <span className="chat-composer-queue-index">{index + 1}</span>
                    <span className="chat-composer-queue-preview" title={item.text}>
                      {previewText(item.text)}
                    </span>
                  </div>
                  {item.projectId && projectLabelById.get(item.projectId) && (
                    <span className="chat-composer-queue-project">
                      {projectLabelById.get(item.projectId)}
                    </span>
                  )}
                </div>
                <div className="chat-composer-queue-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="chat-composer-queue-icon-btn"
                    onClick={() => openEdit(item)}
                    disabled={isSending}
                    aria-label={t("chat.editQueued")}
                    title={t("chat.editQueued")}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="chat-composer-queue-icon-btn"
                    onClick={() => onSendNow(item.id)}
                    disabled={isPipelineBusy || isSending}
                    aria-label={t("chat.sendQueuedNow")}
                    title={t("chat.sendQueuedNow")}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="chat-composer-queue-icon-btn"
                    onClick={() => onRemoveItem(item.id)}
                    disabled={isSending}
                    aria-label={t("chat.removeFromQueue")}
                    title={t("chat.removeFromQueue")}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="chat-composer-queue-dialog">
          <DialogHeader>
            <DialogTitle>{t("chat.editQueued")}</DialogTitle>
          </DialogHeader>
          <div className="chat-composer-queue-dialog-editor">
            <MarkdownEditor
              value={editBody}
              onChange={setEditBody}
              placeholder={t("chat.placeholder")}
              mentions={mentionOptions}
              slashWorkflows={slashWorkflows}
              onSubmit={saveEdit}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={saveEdit} disabled={!editBody.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
