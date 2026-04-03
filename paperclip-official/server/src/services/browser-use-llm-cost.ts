import type { BrowserUseLlmUsagePayload } from "./browser-use-gateway.js";

/**
 * 將 browser-use 回傳的 ChatInvokeUsage 對應到 cost_events 欄位。
 * prompt_tokens 含快取命中；新輸入 prompt ≈ prompt_tokens − prompt_cached_tokens。
 */
export function splitBrowserUseUsageForCostEvent(usage: BrowserUseLlmUsagePayload): {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
} {
  const promptTotal = Math.max(0, Number(usage.prompt_tokens ?? 0));
  const cachedRead = Math.max(0, Number(usage.prompt_cached_tokens ?? 0));
  const uncachedInput = Math.max(0, promptTotal - cachedRead);
  const outputTokens = Math.max(0, Number(usage.completion_tokens ?? 0));
  const cachedWrite = Math.max(0, Number(usage.prompt_cache_creation_tokens ?? 0));
  return {
    inputTokens: uncachedInput,
    outputTokens,
    cachedReadTokens: cachedRead,
    cachedWriteTokens: cachedWrite,
  };
}

/**
 * 以每百萬 token 美元單價估算 browser-use 抽取步驟的 LLM 成本（可透過環境變數覆寫）。
 * 預設對齊常見 OpenAI 小模型區間；實際費率請依所用供應商調整。
 */
export function estimateBrowserUseExtractCostCents(params: {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
}): number {
  const inputPerM = Number(process.env.PAPERCLIP_BROWSER_USE_INPUT_USD_PER_MTOK ?? "0.15");
  const outputPerM = Number(process.env.PAPERCLIP_BROWSER_USE_OUTPUT_USD_PER_MTOK ?? "0.60");
  const cachedReadPerM = Number(
    process.env.PAPERCLIP_BROWSER_USE_CACHED_READ_USD_PER_MTOK ?? String(inputPerM * 0.5),
  );
  const cachedWritePerM = Number(
    process.env.PAPERCLIP_BROWSER_USE_CACHED_WRITE_USD_PER_MTOK ?? String(inputPerM * 1.25),
  );

  const usd =
    (params.inputTokens / 1_000_000) * inputPerM +
    (params.outputTokens / 1_000_000) * outputPerM +
    (params.cachedReadTokens / 1_000_000) * cachedReadPerM +
    (params.cachedWriteTokens / 1_000_000) * cachedWritePerM;

  return Math.max(0, Math.round(usd * 100));
}
