/**
 * 作業流程 prompt 步驟：依執行中 Agent 的 adapterType 選擇對應 LLM HTTP API 產生「步驟結果」寫入 output 變數。
 * 未設定對應 API key 或設 WORKFLOW_PROMPT_LLM_DISABLED 時，回傳空字串。
 */
import { logger } from "../middleware/logger.js";

const MAX_OUTPUT_CHARS = 500_000;

/** 與聊天標題無關；模型依使用者指令語言回應即可。 */
export const WORKFLOW_PROMPT_SYSTEM = `You execute a single step in an automated workflow. Follow the USER message (the step instruction, including any context) and produce ONLY the step output text.
Rules:
- No markdown fences unless the instruction explicitly asks for them.
- Avoid meta-commentary ("Here is...", "Sure,") unless the instruction asks for that tone.
- Match the language of the instruction when appropriate.`;

export type WorkflowPromptAgentHint = {
  adapterType: string;
  adapterConfig: Record<string, unknown>;
} | null;

function isWorkflowPromptLlmDisabled(): boolean {
  const v = process.env.WORKFLOW_PROMPT_LLM_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** 專用 key；未設則與其他功能共用 OPENAI_API_KEY。 */
export function workflowPromptOpenAiApiKey(): string | null {
  const k =
    process.env.WORKFLOW_PROMPT_OPENAI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  return k || null;
}

function workflowPromptAnthropicApiKey(): string | null {
  const k = process.env.ANTHROPIC_API_KEY?.trim() || "";
  return k || null;
}

function workflowPromptGeminiApiKey(): string | null {
  const k =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";
  return k || null;
}

function modelFromConfig(config: Record<string, unknown>, fallback: string): string {
  const m = config.model;
  return typeof m === "string" && m.trim().length > 0 ? m.trim() : fallback;
}

/**
 * 依 Agent adapter 決定 workflow prompt 步驟要用的 HTTP 完成端點族別。
 * - legacy_openai：無 agent、或 process/http/openclaw 等無對應 Chat API 時，沿用既有 OPENAI 專用路徑（相容舊行為）。
 */
export type WorkflowPromptCompletionFamily =
  | "openai"
  | "anthropic"
  | "gemini"
  | "legacy_openai";

export function resolveWorkflowPromptCompletionFamily(
  adapterType: string | undefined,
  adapterConfig: Record<string, unknown>,
): WorkflowPromptCompletionFamily {
  const model = String(adapterConfig.model ?? "").toLowerCase();

  switch (adapterType) {
    case "gemini_local":
    case "gemini_remote":
      return "gemini";
    case "claude_local":
    case "claude_remote":
      return "anthropic";
    case "codex_local":
    case "codex_remote":
    case "opencode_local":
    case "pi_local":
      return "openai";
    case "cursor":
      if (model.includes("gemini")) return "gemini";
      if (model.includes("claude") || model.includes("sonnet") || model.includes("opus")) return "anthropic";
      return "openai";
    case "process":
    case "http":
    case "openclaw_gateway":
    default:
      return "legacy_openai";
  }
}

export type WorkflowPromptOutputSource =
  | "openai"
  | "anthropic"
  | "gemini"
  | "fallback";

export type ResolveWorkflowPromptStepOutputResult =
  | { ok: true; text: string; source: WorkflowPromptOutputSource }
  | { ok: false; error: string };

function parseTimeoutMs(envName: string, defaultMs: number): number {
  const raw = parseInt(process.env[envName] ?? String(defaultMs), 10);
  return Number.isFinite(raw) ? Math.min(Math.max(raw, 1000), 600_000) : defaultMs;
}

async function completeOpenAiCompatible(options: {
  renderedInstruction: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}): Promise<ResolveWorkflowPromptStepOutputResult> {
  const { renderedInstruction, apiKey, model, timeoutMs, maxTokens } = options;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: WORKFLOW_PROMPT_SYSTEM },
          { role: "user", content: renderedInstruction.slice(0, 1_000_000) },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn({ status: res.status }, "workflow prompt OpenAI non-OK");
      return {
        ok: false,
        error: `Workflow prompt LLM failed (${res.status}): ${errText.slice(0, 500)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (text.length > MAX_OUTPUT_CHARS) {
      return { ok: false, error: "Workflow prompt LLM output too large" };
    }
    return { ok: true, text, source: "openai" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "workflow prompt OpenAI request failed");
    return { ok: false, error: `Workflow prompt LLM error: ${msg}` };
  }
}

async function completeAnthropic(options: {
  renderedInstruction: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}): Promise<ResolveWorkflowPromptStepOutputResult> {
  const { renderedInstruction, apiKey, model, timeoutMs } = options;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: WORKFLOW_PROMPT_SYSTEM,
        messages: [{ role: "user", content: renderedInstruction.slice(0, 1_000_000) }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn({ status: res.status }, "workflow prompt Anthropic non-OK");
      return {
        ok: false,
        error: `Workflow prompt LLM failed (${res.status}): ${errText.slice(0, 500)}`,
      };
    }

    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const block = data.content?.find((c) => c.type === "text");
    const text = typeof block?.text === "string" ? block.text.trim() : "";
    if (text.length > MAX_OUTPUT_CHARS) {
      return { ok: false, error: "Workflow prompt LLM output too large" };
    }
    return { ok: true, text, source: "anthropic" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "workflow prompt Anthropic request failed");
    return { ok: false, error: `Workflow prompt LLM error: ${msg}` };
  }
}

async function completeGemini(options: {
  renderedInstruction: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}): Promise<ResolveWorkflowPromptStepOutputResult> {
  const { renderedInstruction, apiKey, model, timeoutMs } = options;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: WORKFLOW_PROMPT_SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [{ text: renderedInstruction.slice(0, 1_000_000) }],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.warn({ status: res.status }, "workflow prompt Gemini non-OK");
      return {
        ok: false,
        error: `Workflow prompt LLM failed (${res.status}): ${errText.slice(0, 500)}`,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.[0];
    const text = typeof part?.text === "string" ? part.text.trim() : "";
    if (text.length > MAX_OUTPUT_CHARS) {
      return { ok: false, error: "Workflow prompt LLM output too large" };
    }
    return { ok: true, text, source: "gemini" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn({ err: e }, "workflow prompt Gemini request failed");
    return { ok: false, error: `Workflow prompt LLM error: ${msg}` };
  }
}

/**
 * @param renderedInstruction 已代入 {{變數}} 的模板（即此步驟要給模型看的完整指令）
 * @param agent 執行此 workflow 的 Agent（含 adapterType）；null 時沿用 legacy OpenAI 環境變數路徑
 */
export async function resolveWorkflowPromptStepOutput(options: {
  renderedInstruction: string;
  agent?: WorkflowPromptAgentHint;
}): Promise<ResolveWorkflowPromptStepOutputResult> {
  const { renderedInstruction, agent } = options;

  if (isWorkflowPromptLlmDisabled()) {
    return { ok: true, text: "", source: "fallback" };
  }

  const timeoutMs = parseTimeoutMs("WORKFLOW_PROMPT_OPENAI_TIMEOUT_MS", 120_000);
  const maxTokensRaw = parseInt(process.env.WORKFLOW_PROMPT_OPENAI_MAX_TOKENS ?? "8192", 10);
  const maxTokens = Number.isFinite(maxTokensRaw) ? Math.min(Math.max(maxTokensRaw, 1), 128_000) : 8192;

  const config = agent?.adapterConfig ?? {};
  const family = agent
    ? resolveWorkflowPromptCompletionFamily(agent.adapterType, config)
    : "legacy_openai";

  const openAiModel =
    process.env.WORKFLOW_PROMPT_OPENAI_MODEL?.trim() ||
    modelFromConfig(config, "gpt-4o-mini");
  const anthropicModel =
    process.env.WORKFLOW_PROMPT_ANTHROPIC_MODEL?.trim() ||
    modelFromConfig(config, "claude-3-5-sonnet-20241022");
  const geminiModel =
    process.env.WORKFLOW_PROMPT_GEMINI_MODEL?.trim() ||
    modelFromConfig(config, "gemini-2.0-flash");

  const tryLegacyOpenAi = (): Promise<ResolveWorkflowPromptStepOutputResult> => {
    const apiKey = workflowPromptOpenAiApiKey();
    if (!apiKey) {
      return Promise.resolve({ ok: true, text: "", source: "fallback" });
    }
    return completeOpenAiCompatible({
      renderedInstruction,
      apiKey,
      model: openAiModel,
      timeoutMs,
      maxTokens,
    });
  };

  if (family === "legacy_openai") {
    return tryLegacyOpenAi();
  }

  if (family === "openai") {
    const apiKey = workflowPromptOpenAiApiKey();
    if (!apiKey) {
      return { ok: true, text: "", source: "fallback" };
    }
    return completeOpenAiCompatible({
      renderedInstruction,
      apiKey,
      model: openAiModel,
      timeoutMs,
      maxTokens,
    });
  }

  if (family === "anthropic") {
    const apiKey = workflowPromptAnthropicApiKey();
    if (!apiKey) {
      return { ok: true, text: "", source: "fallback" };
    }
    return completeAnthropic({
      renderedInstruction,
      apiKey,
      model: anthropicModel,
      timeoutMs,
    });
  }

  if (family === "gemini") {
    const apiKey = workflowPromptGeminiApiKey();
    if (!apiKey) {
      return { ok: true, text: "", source: "fallback" };
    }
    return completeGemini({
      renderedInstruction,
      apiKey,
      model: geminiModel,
      timeoutMs,
    });
  }

  const _exhaustive: never = family;
  return _exhaustive;
}
