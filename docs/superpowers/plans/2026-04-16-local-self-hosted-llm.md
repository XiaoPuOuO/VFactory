# Local Self-Hosted LLM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `local_self_hosted_llm` adapter，讓使用者能建立連到本地自架 OpenAI-compatible LLM endpoint 的 AI 員工，具備權限控管、設定表單、連線測試、執行與 transcript 呈現。

**Architecture:** 以既有 adapter 架構為主，在 `shared` 納入新的 adapter type 與 `model.*` 權限鍵，在 `ui` 加入新卡片與專屬設定欄位，在 `server` 新增專用 adapter 模組，底層以 OpenAI-compatible HTTP 呼叫實作 `testEnvironment` 與 `execute`。為了降低風險，第一版採非串流執行，並以 JSONL stdout 事件讓 UI transcript 直接重用既有轉錄管線。

**Tech Stack:** TypeScript、React、TanStack Query、Zod、Express、現有 Paperclip adapter registry、Vitest

---

## File Structure

### Existing files to modify

- `paperclip-official/packages/shared/src/constants.ts`
  - 新增 adapter type、non-admin/remote 相關常數判斷、權限鍵與 adapter-permission 映射
- `paperclip-official/packages/adapter-utils/src/types.ts`
  - 擴充 `CreateConfigValues`，加入本地自架 LLM 需要的 `baseUrl`
- `paperclip-official/packages/shared/src/validators/agent.ts`
  - 讓 schema 接受新的 adapter type 與新表單值（透過通用 record 仍需確認）
- `paperclip-official/packages/shared/src/index.ts`
  - 重新匯出更新後的 shared 常數與型別
- `paperclip-official/server/src/services/access.ts`
  - 讓 `allowedAdapterTypes` 回傳新 adapter
- `paperclip-official/server/src/adapters/registry.ts`
  - 註冊新的 server adapter
- `paperclip-official/server/src/routes/agents.ts`
  - 讓建立/更新 agent 時套用新 adapter 的預設值與 config 約束
- `paperclip-official/ui/src/components/agent-config-defaults.ts`
  - 新增 `baseUrl` 預設值欄位
- `paperclip-official/ui/src/components/agent-config-primitives.tsx`
  - 加入 adapter label 與 help 文案
- `paperclip-official/ui/src/components/AgentConfigForm.tsx`
  - 將新 adapter 視為 local 類型、接線測試與表單欄位顯示
- `paperclip-official/ui/src/components/NewAgentDialog.tsx`
  - 新增「本地自架 LLM」卡片
- `paperclip-official/ui/src/pages/NewAgent.tsx`
  - 讓 advanced adapter 列表與 create 預設值支援新 adapter
- `paperclip-official/ui/src/adapters/registry.ts`
  - 註冊新的 UI adapter
- `paperclip-official/ui/src/locales/en.json`
  - 新增 adapter 名稱、描述、欄位與錯誤文案
- `paperclip-official/ui/src/locales/zh-TW.json`
  - 新增繁中對應文案
- `paperclip-official/documents/...`
  - 更新受影響技術文件（若現有 documents 已有 adapter/agent 說明，需同步）

### New files to create

- `paperclip-official/server/src/adapters/local-self-hosted-llm/index.ts`
  - server adapter 匯出（`execute`、`testEnvironment`、`sessionCodec`、doc）
- `paperclip-official/server/src/adapters/local-self-hosted-llm/execute.ts`
  - OpenAI-compatible chat/completions 呼叫與 JSONL stdout 輸出
- `paperclip-official/server/src/adapters/local-self-hosted-llm/test.ts`
  - base URL/model 驗證與連線測試
- `paperclip-official/server/src/adapters/local-self-hosted-llm/session.ts`
  - 第一版 session codec（可先是 pass-through/null-safe codec）
- `paperclip-official/ui/src/adapters/local-self-hosted-llm/index.ts`
  - UI adapter module
- `paperclip-official/ui/src/adapters/local-self-hosted-llm/config-fields.tsx`
  - Base URL / Model / API Key 專屬欄位
- `paperclip-official/ui/src/adapters/local-self-hosted-llm/build-config.ts`
  - 建立 adapterConfig
- `paperclip-official/ui/src/adapters/local-self-hosted-llm/parse-stdout.ts`
  - 解析 JSONL transcript 事件
- `paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter.test.ts`
  - execute / parser 相關測試
- `paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter-environment.test.ts`
  - testEnvironment 測試
- `paperclip-official/server/src/__tests__/local-self-hosted-llm-access.test.ts`
  - allowed adapter types / 權限邊界測試

---

### Task 1: Shared constants and form model

**Files:**
- Modify: `paperclip-official/packages/shared/src/constants.ts`
- Modify: `paperclip-official/packages/adapter-utils/src/types.ts`
- Modify: `paperclip-official/packages/shared/src/validators/agent.ts`
- Modify: `paperclip-official/packages/shared/src/index.ts`
- Test: `paperclip-official/server/src/__tests__/local-self-hosted-llm-access.test.ts`

- [ ] **Step 1: Write the failing access/constant test**

```ts
import { describe, expect, it } from "vitest";
import {
  AGENT_ADAPTER_TYPES,
  MODEL_PERMISSION_KEYS,
  ADAPTER_TYPE_TO_MODEL_PERMISSION,
} from "@paperclipai/shared";

describe("local_self_hosted_llm shared constants", () => {
  it("registers the adapter type and permission mapping", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("local_self_hosted_llm");
    expect(MODEL_PERMISSION_KEYS).toContain("model.local_self_hosted_llm");
    expect(ADAPTER_TYPE_TO_MODEL_PERMISSION.local_self_hosted_llm).toBe(
      "model.local_self_hosted_llm",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-access.test.ts`

Expected: FAIL because `local_self_hosted_llm` and `model.local_self_hosted_llm` are not defined.

- [ ] **Step 3: Add shared constants and form field support**

```ts
// packages/shared/src/constants.ts
export const AGENT_ADAPTER_TYPES = [
  "process",
  "http",
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "gemini_local",
  "gemini_remote",
  "opencode_local",
  "pi_local",
  "cursor",
  "openclaw_gateway",
  "local_self_hosted_llm",
] as const;

export const MODEL_PERMISSION_KEYS = [
  "model.gemini.local",
  "model.gemini.remote",
  "model.claude.local",
  "model.claude.remote",
  "model.codex.local",
  "model.codex.remote",
  "model.cursor.local",
  "model.opencode.local",
  "model.pi.local",
  "model.openclaw_gateway",
  "model.local_self_hosted_llm",
] as const;

export const ADAPTER_TYPE_TO_MODEL_PERMISSION: Record<string, ModelPermissionKey> = {
  gemini_local: "model.gemini.local",
  gemini_remote: "model.gemini.remote",
  claude_local: "model.claude.local",
  claude_remote: "model.claude.remote",
  codex_local: "model.codex.local",
  codex_remote: "model.codex.remote",
  cursor: "model.cursor.local",
  opencode_local: "model.opencode.local",
  pi_local: "model.pi.local",
  openclaw_gateway: "model.openclaw_gateway",
  local_self_hosted_llm: "model.local_self_hosted_llm",
};
```

```ts
// packages/adapter-utils/src/types.ts
export interface CreateConfigValues {
  adapterType: string;
  cwd: string;
  instructionsFilePath?: string;
  promptTemplate: string;
  model: string;
  baseUrl: string;
  thinkingEffort: string;
  // ... existing fields
}
```

```ts
// packages/shared/src/index.ts
export {
  AGENT_ADAPTER_TYPES,
  MODEL_PERMISSION_KEYS,
  ADAPTER_TYPE_TO_MODEL_PERMISSION,
  // ...existing exports
} from "./constants.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-access.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/packages/shared/src/constants.ts paperclip-official/packages/adapter-utils/src/types.ts paperclip-official/packages/shared/src/validators/agent.ts paperclip-official/packages/shared/src/index.ts paperclip-official/server/src/__tests__/local-self-hosted-llm-access.test.ts
git commit -m "feat: 新增本地自架 LLM adapter 常數與權限映射"
```

### Task 2: Server permission path and create/update defaults

**Files:**
- Modify: `paperclip-official/server/src/services/access.ts`
- Modify: `paperclip-official/server/src/routes/agents.ts`
- Test: `paperclip-official/server/src/__tests__/local-self-hosted-llm-access.test.ts`

- [ ] **Step 1: Extend the failing server access test**

```ts
it("includes local_self_hosted_llm when the principal has the model permission", async () => {
  const allowed = await access.getAllowedAdapterTypes(companyId, userId, false);
  expect(allowed).toContain("local_self_hosted_llm");
});

it("rejects agent creation when local_self_hosted_llm is not allowed", async () => {
  const res = await request(app)
    .post(`/api/companies/${companyId}/agents`)
    .send({
      name: "Self Hosted",
      adapterType: "local_self_hosted_llm",
      adapterConfig: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
      },
    });

  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-access.test.ts`

Expected: FAIL because `getAllowedAdapterTypes` does not yet surface the new adapter and create-route defaults/constraints are missing.

- [ ] **Step 3: Implement access and route defaults**

```ts
// server/src/services/access.ts
async function getAllowedAdapterTypes(
  companyId: string,
  userId: string | null | undefined,
  hasViewAll: boolean,
): Promise<string[]> {
  const allTypes = Object.keys(ADAPTER_TYPE_TO_MODEL_PERMISSION);
  if (hasViewAll || !userId) return allTypes;

  const allowed: string[] = [];
  for (const adapterType of allTypes) {
    const perm = ADAPTER_TYPE_TO_MODEL_PERMISSION[adapterType];
    if (perm && (await canUser(companyId, userId, perm))) {
      allowed.push(adapterType);
    }
  }
  return allowed;
}
```

```ts
// server/src/routes/agents.ts
function applyCreateDefaultsByAdapterType(
  adapterType: string | null | undefined,
  adapterConfig: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...adapterConfig };

  if (adapterType === "local_self_hosted_llm") {
    if (!asNonEmptyString(next.baseUrl)) {
      next.baseUrl = "http://127.0.0.1:11434/v1";
    }
    return ensureGatewayDeviceKey(adapterType, next);
  }

  // existing branches...
  return ensureGatewayDeviceKey(adapterType, next);
}

async function assertAdapterConfigConstraints(
  companyId: string,
  adapterType: string | null | undefined,
  adapterConfig: Record<string, unknown>,
) {
  if (adapterType === "local_self_hosted_llm") {
    const baseUrl = asNonEmptyString(adapterConfig.baseUrl);
    const model = asNonEmptyString(adapterConfig.model);
    if (!baseUrl) throw unprocessable("Invalid local_self_hosted_llm adapterConfig: baseUrl is required");
    if (!model) throw unprocessable("Invalid local_self_hosted_llm adapterConfig: model is required");
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("baseUrl must use http or https");
      }
    } catch (err) {
      throw unprocessable(`Invalid local_self_hosted_llm adapterConfig: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (adapterType !== "opencode_local") return;
  // existing branch...
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-access.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/server/src/services/access.ts paperclip-official/server/src/routes/agents.ts paperclip-official/server/src/__tests__/local-self-hosted-llm-access.test.ts
git commit -m "feat: 套用本地自架 LLM adapter 權限與建立驗證"
```

### Task 3: Server adapter environment test

**Files:**
- Create: `paperclip-official/server/src/adapters/local-self-hosted-llm/test.ts`
- Create: `paperclip-official/server/src/adapters/local-self-hosted-llm/index.ts`
- Create: `paperclip-official/server/src/adapters/local-self-hosted-llm/session.ts`
- Modify: `paperclip-official/server/src/adapters/registry.ts`
- Test: `paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter-environment.test.ts`

- [ ] **Step 1: Write the failing environment test**

```ts
import { describe, expect, it, vi } from "vitest";
import { testEnvironment } from "../adapters/local-self-hosted-llm/test";

describe("local_self_hosted_llm environment test", () => {
  it("fails when baseUrl is missing", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "local_self_hosted_llm",
      config: { model: "llama3.1" },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "local_base_url_missing")).toBe(true);
  });

  it("passes when the endpoint responds and the model is listed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({ data: [{ id: "llama3.1", object: "model" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(null, { status: 200 });
    }));

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "local_self_hosted_llm",
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
      },
    });

    expect(result.status).toBe("pass");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-adapter-environment.test.ts`

Expected: FAIL because the adapter module does not exist yet.

- [ ] **Step 3: Implement environment testing and registry entry**

```ts
// server/src/adapters/local-self-hosted-llm/session.ts
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  },
  serialize(params) {
    return params && Object.keys(params).length > 0 ? params : null;
  },
  getDisplayId(params) {
    const sessionId = params?.sessionId;
    return typeof sessionId === "string" ? sessionId : null;
  },
};
```

```ts
// server/src/adapters/local-self-hosted-llm/test.ts
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const baseUrl = typeof ctx.config.baseUrl === "string" ? ctx.config.baseUrl.trim() : "";
  const model = typeof ctx.config.model === "string" ? ctx.config.model.trim() : "";
  const apiKey = typeof ctx.config.apiKey === "string" ? ctx.config.apiKey.trim() : "";

  if (!baseUrl) {
    checks.push({
      code: "local_base_url_missing",
      level: "error",
      message: "Base URL is required.",
      hint: "Set adapterConfig.baseUrl, e.g. http://127.0.0.1:11434/v1",
    });
  }

  if (!model) {
    checks.push({
      code: "local_model_missing",
      level: "error",
      message: "Model is required.",
      hint: "Set adapterConfig.model to the exact model id exposed by the endpoint.",
    });
  }

  let parsedUrl: URL | null = null;
  if (baseUrl) {
    try {
      parsedUrl = new URL(baseUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        checks.push({
          code: "local_base_url_protocol_invalid",
          level: "error",
          message: `Unsupported protocol: ${parsedUrl.protocol}`,
          hint: "Use an http:// or https:// URL.",
        });
      }
    } catch {
      checks.push({
        code: "local_base_url_invalid",
        level: "error",
        message: `Invalid Base URL: ${baseUrl}`,
      });
    }
  }

  if (parsedUrl && model) {
    const headers: Record<string, string> = {};
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    try {
      const modelsUrl = new URL("./models", parsedUrl).toString();
      const response = await fetch(modelsUrl, { headers });
      if (!response.ok) {
        checks.push({
          code: "local_models_probe_failed",
          level: "warn",
          message: `Model probe returned HTTP ${response.status}.`,
          hint: "Verify the endpoint is OpenAI-compatible and reachable from the server host.",
        });
      } else {
        const payload = (await response.json()) as { data?: Array<{ id?: string }> };
        const modelIds = Array.isArray(payload.data)
          ? payload.data.map((entry) => entry?.id).filter((id): id is string => typeof id === "string")
          : [];
        if (modelIds.includes(model)) {
          checks.push({
            code: "local_model_available",
            level: "info",
            message: `Model available: ${model}`,
          });
        } else {
          checks.push({
            code: "local_model_missing_from_endpoint",
            level: "error",
            message: `Configured model not found: ${model}`,
            hint: "Use the exact model id returned by GET /models.",
          });
        }
      }
    } catch (err) {
      checks.push({
        code: "local_endpoint_unreachable",
        level: "error",
        message: err instanceof Error ? err.message : "Connection failed",
        hint: "Verify the endpoint is running and reachable from the Paperclip server host.",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
```

```ts
// server/src/adapters/local-self-hosted-llm/index.ts
import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { sessionCodec } from "./session.js";

export const localSelfHostedLlmAdapter: ServerAdapterModule = {
  type: "local_self_hosted_llm",
  execute,
  testEnvironment,
  sessionCodec,
  models: [],
  agentConfigurationDoc: `# local_self_hosted_llm agent configuration

Adapter: local_self_hosted_llm

Use when:
- The agent should invoke a self-hosted OpenAI-compatible endpoint on the local/private network
- You want to target tools such as Ollama, LM Studio, or vLLM via baseUrl + model

Don't use when:
- You need a local CLI runtime such as Claude Code, Codex CLI, or Cursor
- You need a generic webhook that is not OpenAI-compatible

Core fields:
- baseUrl (string, required): OpenAI-compatible endpoint base, e.g. http://127.0.0.1:11434/v1
- model (string, required): exact model id to send to chat/completions
- apiKey (string, optional): bearer token used when the endpoint requires authentication
`,
};
```

```ts
// server/src/adapters/registry.ts
import { localSelfHostedLlmAdapter } from "./local-self-hosted-llm/index.js";

const adaptersByType = new Map<string, ServerAdapterModule>(
  [
    claudeLocalAdapter,
    claudeRemoteAdapter,
    codexLocalAdapter,
    codexRemoteAdapter,
    openCodeLocalAdapter,
    piLocalAdapter,
    cursorLocalAdapter,
    geminiLocalAdapter,
    geminiRemoteAdapter,
    openclawGatewayAdapter,
    localSelfHostedLlmAdapter,
    processAdapter,
    httpAdapter,
  ].map((a) => [a.type, a]),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-adapter-environment.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/server/src/adapters/local-self-hosted-llm/index.ts paperclip-official/server/src/adapters/local-self-hosted-llm/test.ts paperclip-official/server/src/adapters/local-self-hosted-llm/session.ts paperclip-official/server/src/adapters/registry.ts paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter-environment.test.ts
git commit -m "feat: 新增本地自架 LLM adapter 連線測試"
```

### Task 4: Server execute path and stdout transcript contract

**Files:**
- Create: `paperclip-official/server/src/adapters/local-self-hosted-llm/execute.ts`
- Create: `paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter.test.ts`

- [ ] **Step 1: Write the failing execute test**

```ts
import { describe, expect, it, vi } from "vitest";
import { execute } from "../adapters/local-self-hosted-llm/execute";

describe("local_self_hosted_llm execute", () => {
  it("posts to chat/completions and emits JSONL stdout transcript", async () => {
    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];

    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: "chatcmpl-1",
          model: "llama3.1",
          choices: [
            {
              message: {
                role: "assistant",
                content: "hello from ollama",
              },
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 4,
            total_tokens: 16,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }));

    const result = await execute({
      runId: "run-1",
      agent: {
        id: "agent-1",
        companyId: "company-1",
        name: "Self Hosted",
        adapterType: "local_self_hosted_llm",
        adapterConfig: {},
      },
      runtime: {
        sessionId: null,
        sessionParams: null,
        sessionDisplayId: null,
        taskKey: null,
      },
      config: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "llama3.1",
        promptTemplate: "You are an agent.",
      },
      context: {},
      onLog: async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.model).toBe("llama3.1");
    expect(result.usage?.inputTokens).toBe(12);
    expect(result.usage?.outputTokens).toBe(4);
    expect(logs.some((entry) => entry.stream === "stdout" && entry.chunk.includes("local_self_hosted_llm.result"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-adapter.test.ts`

Expected: FAIL because execute is not implemented.

- [ ] **Step 3: Implement execute with OpenAI-compatible request**

```ts
// server/src/adapters/local-self-hosted-llm/execute.ts
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";

function joinBaseUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function asTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" && part !== null && typeof (part as { text?: unknown }).text === "string"
            ? String((part as { text: string }).text)
            : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const baseUrl = typeof ctx.config.baseUrl === "string" ? ctx.config.baseUrl.trim() : "";
  const model = typeof ctx.config.model === "string" ? ctx.config.model.trim() : "";
  const promptTemplate = typeof ctx.config.promptTemplate === "string" ? ctx.config.promptTemplate : "";
  const apiKey = typeof ctx.config.apiKey === "string" ? ctx.config.apiKey.trim() : "";

  if (!baseUrl) throw new Error("local_self_hosted_llm missing baseUrl");
  if (!model) throw new Error("local_self_hosted_llm missing model");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const response = await fetch(joinBaseUrl(baseUrl, "./chat/completions"), {
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

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI-compatible invoke failed with status ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };

  const text = asTextContent(payload.choices?.[0]?.message?.content);
  const inputTokens = payload.usage?.prompt_tokens ?? 0;
  const outputTokens = payload.usage?.completion_tokens ?? 0;

  await ctx.onLog(
    "stdout",
    `${JSON.stringify({
      type: "local_self_hosted_llm.result",
      text,
      model: payload.model ?? model,
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
    model: payload.model ?? model,
    usage: {
      inputTokens,
      outputTokens,
    },
    costUsd: 0,
    summary: text.slice(0, 500),
    resultJson: payload as Record<string, unknown>,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-adapter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/server/src/adapters/local-self-hosted-llm/execute.ts paperclip-official/server/src/__tests__/local-self-hosted-llm-adapter.test.ts
git commit -m "feat: 新增本地自架 LLM adapter 執行鏈路"
```

### Task 5: UI adapter and form fields

**Files:**
- Create: `paperclip-official/ui/src/adapters/local-self-hosted-llm/index.ts`
- Create: `paperclip-official/ui/src/adapters/local-self-hosted-llm/config-fields.tsx`
- Create: `paperclip-official/ui/src/adapters/local-self-hosted-llm/build-config.ts`
- Create: `paperclip-official/ui/src/adapters/local-self-hosted-llm/parse-stdout.ts`
- Modify: `paperclip-official/ui/src/adapters/registry.ts`
- Modify: `paperclip-official/ui/src/components/agent-config-defaults.ts`
- Modify: `paperclip-official/ui/src/components/agent-config-primitives.tsx`
- Modify: `paperclip-official/ui/src/components/AgentConfigForm.tsx`
- Modify: `paperclip-official/ui/src/pages/NewAgent.tsx`
- Modify: `paperclip-official/ui/src/components/NewAgentDialog.tsx`

- [ ] **Step 1: Write the failing UI adapter test/expectation**

```ts
import { describe, expect, it } from "vitest";
import { getUIAdapter } from "../adapters/registry";
import { defaultCreateValues } from "../components/agent-config-defaults";

describe("local_self_hosted_llm ui adapter", () => {
  it("builds adapter config with the default local base URL", () => {
    const adapter = getUIAdapter("local_self_hosted_llm");
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType: "local_self_hosted_llm",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
    });

    expect(config.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(config.model).toBe("llama3.1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/ui test -- local-self-hosted-llm-ui.test.ts`

Expected: FAIL because the UI adapter is not registered and `baseUrl` is not part of defaults.

- [ ] **Step 3: Implement UI adapter registration, defaults, and fields**

```ts
// ui/src/components/agent-config-defaults.ts
export const defaultCreateValues: CreateConfigValues = {
  adapterType: "claude_local",
  cwd: "",
  instructionsFilePath: "",
  promptTemplate: "",
  model: "",
  baseUrl: "http://127.0.0.1:11434/v1",
  thinkingEffort: "",
  // ...existing fields
};
```

```ts
// ui/src/components/agent-config-primitives.tsx
export const help: Record<string, string> = {
  // ...existing keys
  baseUrl: "OpenAI-compatible endpoint base for a self-hosted local model, e.g. http://127.0.0.1:11434/v1",
};

export const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  claude_remote: "Claude (remote)",
  codex_local: "Codex (local)",
  codex_remote: "Codex (remote)",
  gemini_local: "Gemini CLI (local)",
  gemini_remote: "Gemini (remote)",
  opencode_local: "OpenCode (local)",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
  local_self_hosted_llm: "Local Self-Hosted LLM",
};
```

```tsx
// ui/src/adapters/local-self-hosted-llm/config-fields.tsx
import type { AdapterConfigFieldsProps } from "../types";
import { DraftInput, Field, help } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function LocalSelfHostedLlmConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="Base URL" hint={help.baseUrl}>
        <DraftInput
          value={isCreate ? values!.baseUrl : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""))}
          onCommit={(v) =>
            isCreate ? set!({ baseUrl: v }) : mark("adapterConfig", "baseUrl", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="http://127.0.0.1:11434/v1"
        />
      </Field>
      <Field label="Model" hint={help.model}>
        <DraftInput
          value={isCreate ? values!.model : eff("adapterConfig", "model", String(config.model ?? ""))}
          onCommit={(v) =>
            isCreate ? set!({ model: v }) : mark("adapterConfig", "model", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="llama3.1"
        />
      </Field>
      <Field label="API Key" hint="Optional bearer token for OpenAI-compatible endpoints that require auth.">
        <DraftInput
          type="password"
          autoComplete="off"
          value={isCreate ? values!.envBindings.apiKey ?? "" : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))}
          onCommit={(v) =>
            isCreate ? set!({ envBindings: { ...(values!.envBindings ?? {}), apiKey: v } }) : mark("adapterConfig", "apiKey", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="Optional"
        />
      </Field>
    </>
  );
}
```

```ts
// ui/src/adapters/local-self-hosted-llm/build-config.ts
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildLocalSelfHostedLlmConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.baseUrl) ac.baseUrl = v.baseUrl;
  if (v.model) ac.model = v.model;
  const apiKey = typeof v.envBindings?.apiKey === "string" ? v.envBindings.apiKey.trim() : "";
  if (apiKey) ac.apiKey = apiKey;
  ac.timeoutSec = 30;
  ac.graceSec = 15;
  return ac;
}
```

```ts
// ui/src/adapters/local-self-hosted-llm/parse-stdout.ts
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
      return [
        { kind: "assistant", ts, text: parsed.text ?? "" },
        {
          kind: "result",
          ts,
          text: parsed.text ?? "",
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
```

```ts
// ui/src/adapters/local-self-hosted-llm/index.ts
import type { UIAdapterModule } from "../types";
import { LocalSelfHostedLlmConfigFields } from "./config-fields";
import { buildLocalSelfHostedLlmConfig } from "./build-config";
import { parseLocalSelfHostedLlmStdoutLine } from "./parse-stdout";

export const localSelfHostedLlmUIAdapter: UIAdapterModule = {
  type: "local_self_hosted_llm",
  label: "Local Self-Hosted LLM",
  parseStdoutLine: parseLocalSelfHostedLlmStdoutLine,
  ConfigFields: LocalSelfHostedLlmConfigFields,
  buildAdapterConfig: buildLocalSelfHostedLlmConfig,
};
```

```ts
// ui/src/adapters/registry.ts
import { localSelfHostedLlmUIAdapter } from "./local-self-hosted-llm";

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
```

```ts
// ui/src/pages/NewAgent.tsx
const SUPPORTED_ADVANCED_ADAPTER_TYPES = new Set<CreateConfigValues["adapterType"]>([
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "gemini_local",
  "gemini_remote",
  "opencode_local",
  "pi_local",
  "cursor",
  "openclaw_gateway",
  "local_self_hosted_llm",
]);

function createValuesForAdapterType(adapterType: CreateConfigValues["adapterType"]): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = { ...defaults, adapterType };
  if (adapterType === "local_self_hosted_llm") {
    nextValues.baseUrl = "http://127.0.0.1:11434/v1";
    nextValues.model = "";
  }
  // existing branches...
  return nextValues;
}
```

```tsx
// ui/src/components/NewAgentDialog.tsx
type AdvancedAdapterType =
  | "claude_local"
  | "claude_remote"
  | "codex_local"
  | "codex_remote"
  | "gemini_local"
  | "gemini_remote"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "openclaw_gateway"
  | "local_self_hosted_llm";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/ui test -- local-self-hosted-llm-ui.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/ui/src/adapters/local-self-hosted-llm/index.ts paperclip-official/ui/src/adapters/local-self-hosted-llm/config-fields.tsx paperclip-official/ui/src/adapters/local-self-hosted-llm/build-config.ts paperclip-official/ui/src/adapters/local-self-hosted-llm/parse-stdout.ts paperclip-official/ui/src/adapters/registry.ts paperclip-official/ui/src/components/agent-config-defaults.ts paperclip-official/ui/src/components/agent-config-primitives.tsx paperclip-official/ui/src/components/AgentConfigForm.tsx paperclip-official/ui/src/pages/NewAgent.tsx paperclip-official/ui/src/components/NewAgentDialog.tsx
git commit -m "feat: 新增本地自架 LLM adapter 設定介面"
```

### Task 6: Internationalization strings

**Files:**
- Modify: `paperclip-official/ui/src/locales/en.json`
- Modify: `paperclip-official/ui/src/locales/zh-TW.json`

- [ ] **Step 1: Write the failing i18n assertion**

```ts
import { describe, expect, it } from "vitest";
import en from "../ui/src/locales/en.json";
import zhTW from "../ui/src/locales/zh-TW.json";

describe("local self-hosted LLM locale strings", () => {
  it("exposes the new adapter strings in both locales", () => {
    expect(en.agents.localSelfHostedLlm).toBeDefined();
    expect(zhTW.agents.localSelfHostedLlm).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- local-self-hosted-llm-i18n.test.ts`

Expected: FAIL because the locale keys do not exist.

- [ ] **Step 3: Add English and Traditional Chinese strings**

```json
// ui/src/locales/en.json (agents)
{
  "localSelfHostedLlm": "Local Self-Hosted LLM",
  "helpBaseUrl": "OpenAI-compatible endpoint base for a self-hosted local model.",
  "baseUrl": "Base URL",
  "baseUrlPlaceholder": "http://127.0.0.1:11434/v1",
  "apiKeyOptional": "API Key (optional)",
  "helpApiKeyOptional": "Optional bearer token for OpenAI-compatible endpoints that require authentication.",
  "selfHostedLlmCardDescription": "OpenAI-compatible endpoint (Ollama/LM Studio/vLLM)"
}
```

```json
// ui/src/locales/zh-TW.json (agents)
{
  "localSelfHostedLlm": "本地自架 LLM",
  "helpBaseUrl": "本地自架模型的 OpenAI 相容 endpoint base。",
  "baseUrl": "Base URL",
  "baseUrlPlaceholder": "http://127.0.0.1:11434/v1",
  "apiKeyOptional": "API 金鑰（選填）",
  "helpApiKeyOptional": "若 endpoint 需要驗證，可填入 Bearer Token。",
  "selfHostedLlmCardDescription": "OpenAI 相容 endpoint（Ollama/LM Studio/vLLM）"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- local-self-hosted-llm-i18n.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/ui/src/locales/en.json paperclip-official/ui/src/locales/zh-TW.json
git commit -m "feat: 新增本地自架 LLM adapter 多語系文案"
```

### Task 7: Documentation and verification

**Files:**
- Modify: `paperclip-official/documents/...`（更新既有 agent/adapter 文件；依實際最接近的文件落點補充）
- Modify: `docs/superpowers/specs/2026-04-16-local-self-hosted-llm-design.md`（若實作時有必要補充決議）

- [ ] **Step 1: Update the affected technical document**

```md
## Local Self-Hosted LLM

- Adapter type: `local_self_hosted_llm`
- Intended for OpenAI-compatible local/private endpoints
- Default Base URL: `http://127.0.0.1:11434/v1`
- Required fields: `baseUrl`, `model`
- Optional field: `apiKey`
- Permission key: `model.local_self_hosted_llm`
```

- [ ] **Step 2: Run targeted tests**

Run: `pnpm --filter @paperclipai/server test -- local-self-hosted-llm-adapter.test.ts local-self-hosted-llm-adapter-environment.test.ts local-self-hosted-llm-access.test.ts`

Expected: PASS

Run: `pnpm --filter @paperclipai/ui test -- local-self-hosted-llm-ui.test.ts`

Expected: PASS

- [ ] **Step 3: Run project verification**

Run: `pnpm --filter @paperclipai/server test -- adapter-models.test.ts adapter-session-codecs.test.ts`

Expected: PASS

Run: `pnpm --filter @paperclipai/ui build`

Expected: PASS

- [ ] **Step 4: Run lint/diagnostics review**

Run: `ReadLints` scoped to modified files

Expected: No newly introduced diagnostics

- [ ] **Step 5: Commit**

```bash
git add paperclip-official/documents docs/superpowers/specs/2026-04-16-local-self-hosted-llm-design.md
git commit -m "docs: 補充本地自架 LLM adapter 技術文件"
```

---

## Self-Review

### 1. Spec coverage

- Adapter type + 權限映射：Task 1, Task 2
- UI 卡片與表單：Task 5, Task 6
- 預設 Base URL：Task 5
- Test Connection：Task 3
- execute + transcript：Task 4
- i18n：Task 6
- 文件同步：Task 7

無缺漏。

### 2. Placeholder scan

- 無 `TODO`/`TBD`
- 每個 task 都有明確檔案、測試、命令與期望結果

### 3. Type consistency

- adapter type 統一使用 `local_self_hosted_llm`
- 權限鍵統一使用 `model.local_self_hosted_llm`
- adapterConfig 欄位統一使用 `baseUrl`、`model`、`apiKey`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-16-local-self-hosted-llm.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 我 dispatch 全新的 subagent 逐 task 實作，並在 task 之間 review

**2. Inline Execution** - 我在這個 session 直接依計畫往下做

你要哪一種？*** End Patch
