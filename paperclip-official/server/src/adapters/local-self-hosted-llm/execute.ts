import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";

function joinOpenAiCompatibleChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  const parsed = new URL(trimmed);

  // Align with `test.ts` / `testEnvironment`: bases like `http://127.0.0.1:11434/v1` must not lose the `/v1`
  // segment when resolving `chat/completions` (avoid `new URL("./chat/completions", base)` pitfalls).
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }

  return new URL("chat/completions", parsed).toString();
}

function asTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" &&
              part !== null &&
              typeof (part as { text?: unknown }).text === "string"
            ? String((part as { text: string }).text)
            : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Response JSON must be an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse OpenAI-compatible JSON response");
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const baseUrl = typeof ctx.config.baseUrl === "string" ? ctx.config.baseUrl.trim() : "";
  const model = typeof ctx.config.model === "string" ? ctx.config.model.trim() : "";
  const promptTemplate =
    typeof ctx.config.promptTemplate === "string" ? ctx.config.promptTemplate : "";
  const apiKey = typeof ctx.config.apiKey === "string" ? ctx.config.apiKey.trim() : "";

  if (!baseUrl) throw new Error("local_self_hosted_llm missing baseUrl");
  if (!model) throw new Error("local_self_hosted_llm missing model");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(joinOpenAiCompatibleChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          {
            role: "user",
            content: promptTemplate,
          },
        ],
      }),
    });
  } catch {
    throw new Error("OpenAI-compatible invoke failed: unable to reach the configured endpoint");
  }

  if (!response.ok) {
    // Avoid echoing raw upstream bodies into errors/logs (may contain sensitive details).
    throw new Error(`OpenAI-compatible invoke failed with HTTP status ${response.status}`);
  }

  const payload = await readJsonObject(response);
  const choicesRaw = payload.choices;
  const choices = Array.isArray(choicesRaw) ? choicesRaw : [];
  const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;

  const text = asTextContent(firstChoice?.message?.content);
  const usageRaw = payload.usage;
  const usage =
    usageRaw && typeof usageRaw === "object"
      ? (usageRaw as { prompt_tokens?: unknown; completion_tokens?: unknown })
      : null;
  const inputTokens = typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0;
  const resolvedModel = typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : model;

  await ctx.onLog(
    "stdout",
    `${JSON.stringify({
      type: "local_self_hosted_llm.result",
      text,
      model: resolvedModel,
      inputTokens,
      outputTokens,
      costUsd: 0,
      isError: false,
      errors: [],
    })}\n`,
  );

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    provider: "openai_compatible",
    model: resolvedModel,
    usage: {
      inputTokens,
      outputTokens,
    },
    costUsd: 0,
    summary: text.slice(0, 500),
    resultJson: payload as Record<string, unknown>,
  };
}
