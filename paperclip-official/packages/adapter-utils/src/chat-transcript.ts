/**
 * 聊天室轉錄組裝：供本地 adapter 將最近訊息壓入 prompt，並以字元上限控制 input token。
 */

export const DEFAULT_CHAT_TRANSCRIPT_LIMIT = 10;
export const DEFAULT_CHAT_TRANSCRIPT_MAX_MESSAGE_CHARS = 1600;
/** 整段轉錄（含行首時間與發話者前綴）的總字元上限；超出時自最舊訊息開始捨棄。 */
export const DEFAULT_CHAT_TRANSCRIPT_MAX_TOTAL_CHARS = 16_000;

const ENV_LIMIT = "PAPERCLIP_CHAT_TRANSCRIPT_LIMIT";
const ENV_MAX_MSG = "PAPERCLIP_CHAT_TRANSCRIPT_MAX_MSG_CHARS";
const ENV_MAX_TOTAL = "PAPERCLIP_CHAT_TRANSCRIPT_MAX_TOTAL_CHARS";

export type ChatTranscriptMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  authorAgentName?: string | null;
};

export type BuildChatTranscriptForPromptOptions = {
  env: Record<string, string>;
  onLog: (stream: "stdout" | "stderr", chunk: string) => void | Promise<void>;
  /** 自 API 取回的最近 N 則（新→舊）；預設見 {@link DEFAULT_CHAT_TRANSCRIPT_LIMIT}，可由 env 覆寫。 */
  limit?: number;
  maxMessageChars?: number;
  maxTotalChars?: number;
};

function shortId(value: string): string {
  return value.slice(0, 8);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 單則訊息正文截斷（用於 prompt）。
 */
export function truncateChatMessageBody(body: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen) + "…";
}

/**
 * 由已排序（時間舊→新）的訊息列組出轉錄字串，並套用單則與總長度上限。
 */
export function formatChatTranscriptForPrompt(
  messages: ChatTranscriptMessage[],
  opts: {
    agentId: string | undefined;
    maxMessageChars: number;
    maxTotalChars: number;
  },
): string | null {
  const { agentId, maxMessageChars, maxTotalChars } = opts;
  if (messages.length === 0) return null;

  /** 與 API「最新在前」無關，統一為時間舊→新再組行。 */
  const ordered = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const lines: string[] = [];
  for (const msg of ordered) {
    const when = new Date(msg.createdAt);
    const hh = when.getHours().toString().padStart(2, "0");
    const mm = when.getMinutes().toString().padStart(2, "0");
    let speaker = "User";
    if (msg.authorAgentId) {
      if (agentId && msg.authorAgentId === agentId) {
        speaker = "You (CEO agent)";
      } else {
        const name =
          msg.authorAgentName && msg.authorAgentName.trim().length > 0
            ? msg.authorAgentName
            : `Agent ${shortId(msg.authorAgentId)}`;
        speaker = name;
      }
    } else if (msg.authorUserId) {
      speaker = "Board";
    }
    const body = truncateChatMessageBody(msg.body ?? "", maxMessageChars);
    lines.push(`[${hh}:${mm}] ${speaker}: ${body}`);
  }

  let joined = lines.join("\n");
  while (joined.length > maxTotalChars && lines.length > 1) {
    lines.shift();
    joined = lines.join("\n");
  }
  if (joined.length > maxTotalChars) {
    joined = joined.slice(0, maxTotalChars) + "…";
  }
  return joined.length > 0 ? joined : null;
}

function resolveLimitsFromEnv(env: Record<string, string>): {
  limit: number;
  maxMessageChars: number;
  maxTotalChars: number;
} {
  return {
    limit: parsePositiveInt(env[ENV_LIMIT], DEFAULT_CHAT_TRANSCRIPT_LIMIT),
    maxMessageChars: parsePositiveInt(env[ENV_MAX_MSG], DEFAULT_CHAT_TRANSCRIPT_MAX_MESSAGE_CHARS),
    maxTotalChars: parsePositiveInt(env[ENV_MAX_TOTAL], DEFAULT_CHAT_TRANSCRIPT_MAX_TOTAL_CHARS),
  };
}

/**
 * 呼叫 Paperclip API 取得聊天室最近訊息，並格式化為可放入 prompt 的轉錄（含長度收斂）。
 */
export async function buildChatTranscriptForPrompt(
  opts: BuildChatTranscriptForPromptOptions,
): Promise<string | null> {
  const { env, onLog } = opts;
  const fromEnv = resolveLimitsFromEnv(env);
  const limit = opts.limit ?? fromEnv.limit;
  const maxMessageChars = opts.maxMessageChars ?? fromEnv.maxMessageChars;
  const maxTotalChars = opts.maxTotalChars ?? fromEnv.maxTotalChars;

  const roomId = env.PAPERCLIP_CHAT_ROOM_ID;
  const companyId = env.PAPERCLIP_COMPANY_ID;
  const apiUrl = env.PAPERCLIP_API_URL || process.env.PAPERCLIP_API_URL;
  const apiKey = env.PAPERCLIP_API_KEY || process.env.PAPERCLIP_API_KEY;
  if (!roomId || !companyId || !apiUrl || !apiKey) return null;

  const url = `${apiUrl.replace(/\/+$/, "")}/api/companies/${companyId}/chat/rooms/${roomId}/messages?limit=${encodeURIComponent(
    String(limit),
  )}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      await onLog(
        "stderr",
        `[paperclip] Failed to fetch chat transcript (${res.status} ${res.statusText}) from ${url}\n`,
      );
      return null;
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return null;

    const messages = json.filter((m): m is ChatTranscriptMessage => typeof m === "object" && m !== null) as ChatTranscriptMessage[];
    if (messages.length === 0) return null;

    const agentId = env.PAPERCLIP_AGENT_ID;
    return formatChatTranscriptForPrompt(messages, {
      agentId,
      maxMessageChars,
      maxTotalChars,
    });
  } catch (err) {
    await onLog(
      "stderr",
      `[paperclip] Error while fetching chat transcript from ${url}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
    return null;
  }
}
