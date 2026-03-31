import { logger } from "../middleware/logger.js";

/** 內建給 LLM / 外部 adapter 的指令：產生短標題，與使用者介面語系無關（模型可依使用者輸入語言回應）。 */
export const CHAT_SESSION_TITLE_SYSTEM_PROMPT = `You name a chat conversation in ONE short line.
Rules:
- Maximum 40 characters (prefer shorter).
- No quotes, no markdown, no trailing punctuation cluster.
- Use the same language as the user's first message when possible.
- Output ONLY the title text, nothing else.`;

const MAX_TITLE_LEN = 80;

/**
 * 清理模型或 HTTP adapter 回傳字串，供寫入 chat_rooms.name。
 */
export function sanitizeGeneratedSessionTitle(raw: string): string | null {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  const noQuotes = oneLine.replace(/^["'「『]|["'」』]$/g, "").trim();
  const cut = noQuotes.length > MAX_TITLE_LEN ? `${noQuotes.slice(0, MAX_TITLE_LEN).trim()}…` : noQuotes;
  return cut.length > 0 ? cut : null;
}

function isDisabled(): boolean {
  const v = process.env.CHAT_SESSION_TITLE_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function openAiApiKey(): string | null {
  const k =
    process.env.CHAT_SESSION_TITLE_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  return k || null;
}

async function titleFromHttpAdapter(
  userText: string,
  systemPrompt: string,
): Promise<string | null> {
  const url = process.env.CHAT_SESSION_TITLE_ADAPTER_URL?.trim();
  if (!url) return null;

  const bearer = process.env.CHAT_SESSION_TITLE_ADAPTER_BEARER?.trim();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      intent: "chat_session_title",
      systemPrompt,
      userMessage: userText.slice(0, 8000),
    }),
    signal: AbortSignal.timeout(
      Math.min(Math.max(Number(process.env.CHAT_SESSION_TITLE_ADAPTER_TIMEOUT_MS) || 25_000, 3000), 60_000),
    ),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "chat session title HTTP adapter non-OK");
    return null;
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = (await res.json()) as { title?: unknown };
    if (typeof data.title === "string") return sanitizeGeneratedSessionTitle(data.title);
    return null;
  }

  const text = await res.text();
  return sanitizeGeneratedSessionTitle(text);
}

async function titleFromOpenAI(userText: string, systemPrompt: string): Promise<string | null> {
  const apiKey = openAiApiKey();
  if (!apiKey) return null;

  const model = process.env.CHAT_SESSION_TITLE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 64,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText.slice(0, 8000) },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "chat session title OpenAI non-OK");
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  return sanitizeGeneratedSessionTitle(content);
}

/**
 * 輕量產生對話標題（不建立 heartbeat run）。
 * 優先順序：CHAT_SESSION_TITLE_ADAPTER_URL → OpenAI（CHAT_SESSION_TITLE_OPENAI_API_KEY 或 OPENAI_API_KEY）。
 */
export async function generateChatSessionTitleFromUserText(userText: string): Promise<string | null> {
  if (isDisabled()) return null;
  const trimmed = userText.trim();
  if (!trimmed) return null;
  const systemPrompt = CHAT_SESSION_TITLE_SYSTEM_PROMPT;

  try {
    const fromHttp = await titleFromHttpAdapter(trimmed, systemPrompt);
    if (fromHttp) return fromHttp;
    return await titleFromOpenAI(trimmed, systemPrompt);
  } catch (err) {
    logger.warn({ err }, "chat session title generation failed");
    return null;
  }
}
