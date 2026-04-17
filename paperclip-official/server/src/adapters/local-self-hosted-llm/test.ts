import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

function joinOpenAiCompatibleModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  const parsed = new URL(trimmed);

  // OpenAI-compatible servers typically expose `GET {base}/models` where `base` is something like:
  // - http://127.0.0.1:11434/v1
  // - http://127.0.0.1:11434/v1/
  //
  // IMPORTANT: `new URL("./models", "http://host/v1")` resolves to `http://host/models` (drops the last path segment),
  // which is incorrect for common "no trailing slash" bases. We therefore normalize by ensuring the base path ends
  // with `/` before resolving the relative `models` segment.
  if (!parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname}/`;
  }

  return new URL("models", parsed).toString();
}

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
      const modelsUrl = joinOpenAiCompatibleModelsUrl(parsedUrl.toString());
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
