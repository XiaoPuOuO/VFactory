import type { TranscriptEntry } from "../types";

export function parseLocalSelfHostedLlmStdoutLine(line: string, ts: string): TranscriptEntry[] {
  try {
    const parsed = JSON.parse(line) as {
      type?: string;
      text?: string;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      isError?: boolean;
      errors?: string[];
    };

    if (parsed.type === "local_self_hosted_llm.result") {
      const text = parsed.text ?? "";
      return [
        { kind: "assistant", ts, text },
        {
          kind: "result",
          ts,
          text,
          inputTokens: parsed.inputTokens ?? 0,
          outputTokens: parsed.outputTokens ?? 0,
          cachedTokens: 0,
          costUsd: parsed.costUsd ?? 0,
          subtype: "final",
          isError: Boolean(parsed.isError),
          errors: Array.isArray(parsed.errors) ? parsed.errors : [],
        },
      ];
    }
  } catch {
    // fall through
  }

  return [{ kind: "stdout", ts, text: line }];
}
