import crypto from "node:crypto";

type BrowserUseAction =
  | "sessions/start"
  | "navigate"
  | "state"
  | "click"
  | "type"
  | "extract"
  | "screenshot"
  | "sessions/close";

type GatewayEnvelope = {
  ok: boolean;
  data: unknown;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  } | null;
  traceId: string;
};

export type BrowserUseGatewayRequest = {
  agentId: string;
  runId: string;
  taskKey?: string | null;
  toolInput: Record<string, unknown>;
  traceId: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/** 與 Python 微服務 `PAPERCLIP_BROWSER_USE_DEBUG` 語意一致：開啟時顯示瀏覽器（headless=false）。 */
function isEnvTruthy(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * `sessions/start` 若未帶 `headless`，依 `PAPERCLIP_BROWSER_USE_DEBUG` 決定：
 * - debug 開啟 → headless `false`（人類可見）
 * - 未開或關閉 → headless `true`（背景）
 */
export function applyBrowserUseSessionStartToolInput(toolInput: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(toolInput, "headless")) {
    return toolInput;
  }
  const debug = isEnvTruthy("PAPERCLIP_BROWSER_USE_DEBUG");
  return { ...toolInput, headless: !debug };
}

function buildGatewayHeaders(body: string) {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const secret = getRequiredEnv("PAPERCLIP_BROWSER_USE_SERVICE_SECRET");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-tool-timestamp": timestamp,
    "x-tool-nonce": nonce,
    "x-tool-signature": signature,
    "x-tool-token": process.env.PAPERCLIP_BROWSER_USE_SERVICE_TOKEN?.trim() ?? "",
  };
}

export function browserUseGatewayService() {
  const baseUrl = getRequiredEnv("PAPERCLIP_BROWSER_USE_SERVICE_URL").replace(/\/+$/, "");

  async function invoke(action: BrowserUseAction, payload: BrowserUseGatewayRequest): Promise<GatewayEnvelope> {
    const targetUrl = `${baseUrl}/v1/${action}`;
    const outgoing =
      action === "sessions/start"
        ? { ...payload, toolInput: applyBrowserUseSessionStartToolInput(payload.toolInput) }
        : payload;
    const body = JSON.stringify(outgoing);
    const headers = buildGatewayHeaders(body);

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error: {
          code: "BROWSER_GATEWAY_HTTP_ERROR",
          message: `browser-use gateway returned HTTP ${res.status}`,
          retryable: res.status >= 500,
          details: parsed,
        },
        traceId: payload.traceId,
      };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return {
        ok: false,
        data: null,
        error: {
          code: "BROWSER_GATEWAY_INVALID_RESPONSE",
          message: "browser-use gateway returned a non-object response",
          retryable: false,
        },
        traceId: payload.traceId,
      };
    }

    const record = parsed as Record<string, unknown>;
    return {
      ok: record.ok === true,
      data: record.data ?? null,
      error:
        record.ok === true
          ? null
          : {
              code: String((record.error as Record<string, unknown> | null)?.code ?? "BROWSER_GATEWAY_ERROR"),
              message: String((record.error as Record<string, unknown> | null)?.message ?? "unknown error"),
              retryable: Boolean((record.error as Record<string, unknown> | null)?.retryable),
              details: (record.error as Record<string, unknown> | null)?.details,
            },
      traceId: String(record.traceId ?? payload.traceId),
    };
  }

  return { invoke };
}
