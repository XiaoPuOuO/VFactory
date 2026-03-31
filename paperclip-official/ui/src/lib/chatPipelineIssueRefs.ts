import type { ChatMessage } from "@paperclipai/shared";
import { extractIssueIdentifiers } from "./extractIssueIdentifiers";

/**
 * 訊息列表為 API 的「最新在前」順序。找出「最新一則使用者訊息」之後（時間上更晚）的 agent 訊息，
 * 從中解析 Issue 識別碼。
 */
export function issueIdentifiersAfterLastUserMessage(
  messagesNewestFirst: ChatMessage[] | undefined,
  issuePrefix: string,
): string[] {
  if (!messagesNewestFirst?.length || !issuePrefix?.trim()) return [];
  let lastUserMessageIndex = -1;
  for (let i = 0; i < messagesNewestFirst.length; i++) {
    if (messagesNewestFirst[i].authorUserId) {
      lastUserMessageIndex = i;
      break;
    }
  }
  if (lastUserMessageIndex < 0) return [];

  const afterUserNewerOnly = messagesNewestFirst.slice(0, lastUserMessageIndex);
  const seen = new Set<string>();
  for (const m of afterUserNewerOnly) {
    if (!m.authorAgentId) continue;
    for (const id of extractIssueIdentifiers(m.body, issuePrefix)) {
      seen.add(id);
    }
  }
  return [...seen];
}
