import type { UIAdapterModule } from "./types";
import { claudeLocalUIAdapter } from "./claude-local";
import { codexLocalUIAdapter } from "./codex-local";
import { cursorLocalUIAdapter } from "./cursor";
import { geminiLocalUIAdapter } from "./gemini-local";
import { openCodeLocalUIAdapter } from "./opencode-local";
import { piLocalUIAdapter } from "./pi-local";
import { openClawGatewayUIAdapter } from "./openclaw-gateway";
import { localSelfHostedLlmUIAdapter } from "./local-self-hosted-llm";
import { processUIAdapter } from "./process";
import { httpUIAdapter } from "./http";

const adaptersByType = new Map<string, UIAdapterModule>(
  [
    claudeLocalUIAdapter,
    { ...claudeLocalUIAdapter, type: "claude_remote" },
    codexLocalUIAdapter,
    { ...codexLocalUIAdapter, type: "codex_remote" },
    geminiLocalUIAdapter,
    { ...geminiLocalUIAdapter, type: "gemini_remote" },
    openCodeLocalUIAdapter,
    piLocalUIAdapter,
    cursorLocalUIAdapter,
    openClawGatewayUIAdapter,
    localSelfHostedLlmUIAdapter,
    processUIAdapter,
    httpUIAdapter,
  ].map((a) => [a.type, a]),
);

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? processUIAdapter;
}
