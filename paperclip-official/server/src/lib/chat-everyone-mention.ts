/**
 * 群組聊天專用：當訊息含 @everyone 時，將群內所有 AI 成員一併納入標註喚醒名單。
 * 與議題留言的 findMentionedAgents 分離，避免在非群組情境誤觸。
 */
export const CHAT_EVERYONE_MENTION_PATTERN = /\B@everyone\b/i;

export function mergeEveryoneMentionedAgentIds(
  roomType: string,
  body: string,
  mentionedIds: string[],
  memberAgentIds: string[],
): string[] {
  if (roomType !== "group") return mentionedIds;
  if (!CHAT_EVERYONE_MENTION_PATTERN.test(body)) return mentionedIds;
  return [...new Set([...mentionedIds, ...memberAgentIds])];
}
