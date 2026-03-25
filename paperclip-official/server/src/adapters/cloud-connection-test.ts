import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

const CLOUD_ADAPTER_TYPES = ["claude_remote", "codex_remote", "gemini_remote"] as const;

function isCloudAdapterType(type: string): type is (typeof CLOUD_ADAPTER_TYPES)[number] {
  return CLOUD_ADAPTER_TYPES.includes(type as (typeof CLOUD_ADAPTER_TYPES)[number]);
}

function getEnvRecord(config: Record<string, unknown>): Record<string, string> {
  const env = config.env;
  if (env == null || typeof env !== "object" || Array.isArray(env)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function getApiKey(adapterType: string, env: Record<string, string>): string | null {
  switch (adapterType) {
    case "claude_remote":
      return (env.ANTHROPIC_API_KEY ?? "").trim() || null;
    case "codex_remote":
      return (env.OPENAI_API_KEY ?? "").trim() || null;
    case "gemini_remote":
      return (env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY ?? "").trim() || null;
    default:
      return null;
  }
}

function result(
  adapterType: string,
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult {
  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  const status = hasError ? "fail" : hasWarn ? "warn" : "pass";
  return {
    adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}

async function testClaudeRemote(apiKey: string): Promise<AdapterEnvironmentCheck> {
  const url = "https://api.anthropic.com/v1/models";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      return {
        code: "cloud_connection_ok",
        level: "info",
        message: "API Key 驗證成功。",
      };
    }
    const body = await res.text();
    let detail: string | null = null;
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      detail = (json?.error?.message ?? (body.length > 200 ? `${body.slice(0, 200)}…` : body)) || null;
    } catch {
      detail = (body.length > 200 ? `${body.slice(0, 200)}…` : body) || null;
    }
    return {
      code: "cloud_connection_failed",
      level: "error",
      message: res.status === 401 ? "API Key 無效或未授權。" : `連線驗證失敗（${res.status}）。`,
      detail: detail ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: "cloud_connection_error",
      level: "error",
      message: "無法連線至 API。",
      detail: message.length > 200 ? `${message.slice(0, 200)}…` : message,
    };
  }
}

async function testCodexRemote(apiKey: string): Promise<AdapterEnvironmentCheck> {
  const url = "https://api.openai.com/v1/models";
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      return {
        code: "cloud_connection_ok",
        level: "info",
        message: "API Key 驗證成功。",
      };
    }
    const body = await res.text();
    let detail: string | null = null;
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      detail = (json?.error?.message ?? (body.length > 200 ? `${body.slice(0, 200)}…` : body)) || null;
    } catch {
      detail = (body.length > 200 ? `${body.slice(0, 200)}…` : body) || null;
    }
    return {
      code: "cloud_connection_failed",
      level: "error",
      message: res.status === 401 ? "API Key 無效或未授權。" : `連線驗證失敗（${res.status}）。`,
      detail: detail ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: "cloud_connection_error",
      level: "error",
      message: "無法連線至 API。",
      detail: message.length > 200 ? `${message.slice(0, 200)}…` : message,
    };
  }
}

async function testGeminiRemote(apiKey: string): Promise<AdapterEnvironmentCheck> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      return {
        code: "cloud_connection_ok",
        level: "info",
        message: "API Key 驗證成功。",
      };
    }
    const body = await res.text();
    let detail: string | null = null;
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      detail = (json?.error?.message ?? (body.length > 200 ? `${body.slice(0, 200)}…` : body)) || null;
    } catch {
      detail = (body.length > 200 ? `${body.slice(0, 200)}…` : body) || null;
    }
    return {
      code: "cloud_connection_failed",
      level: "error",
      message: res.status === 400 || res.status === 403 ? "API Key 無效或未授權。" : `連線驗證失敗（${res.status}）。`,
      detail: detail ?? undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: "cloud_connection_error",
      level: "error",
      message: "無法連線至 API。",
      detail: message.length > 200 ? `${message.slice(0, 200)}…` : message,
    };
  }
}

/**
 * 雲端適配器專用：僅以 List Models API 驗證 API Key，不發送 completion、不消耗 Token。
 * 僅支援 claude_remote、codex_remote、gemini_remote。
 */
export async function testCloudConnection(
  adapterType: string,
  config: Record<string, unknown>,
): Promise<AdapterEnvironmentTestResult> {
  if (!isCloudAdapterType(adapterType)) {
    return result(adapterType, [
      {
        code: "cloud_connection_unsupported",
        level: "error",
        message: `此適配器不支援雲端連線測試：${adapterType}`,
      },
    ]);
  }

  const env = getEnvRecord(config);
  const apiKey = getApiKey(adapterType, env);

  if (!apiKey) {
    return result(adapterType, [
      {
        code: "cloud_api_key_missing",
        level: "error",
        message: "請先輸入 API Key 再執行測試連線。",
      },
    ]);
  }

  let check: AdapterEnvironmentCheck;
  switch (adapterType) {
    case "claude_remote":
      check = await testClaudeRemote(apiKey);
      break;
    case "codex_remote":
      check = await testCodexRemote(apiKey);
      break;
    case "gemini_remote":
      check = await testGeminiRemote(apiKey);
      break;
    default:
      check = {
        code: "cloud_connection_unsupported",
        level: "error",
        message: `不支援的適配器類型：${adapterType}`,
      };
  }

  return result(adapterType, [check]);
}

export function isCloudAdapter(type: string): boolean {
  return isCloudAdapterType(type);
}
