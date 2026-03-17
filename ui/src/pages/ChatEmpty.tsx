import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";

/** 未選對話時，右側顯示的空白狀態（「開始聊天吧」）。 */
export function ChatEmpty() {
  const { t } = useTranslation();
  return (
    <div className="chat-empty">
      <MessageCircle className="chat-empty-icon" aria-hidden />
      <p className="chat-empty-text">{t("chat.emptyStatePrompt")}</p>
    </div>
  );
}
