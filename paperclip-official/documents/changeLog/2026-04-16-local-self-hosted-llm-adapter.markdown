# Change Log — 2026-04-16 — local_self_hosted_llm adapter

## Summary

- 新增 `local_self_hosted_llm` adapter：OpenAI-compatible `baseUrl` + `model`，預設 `http://127.0.0.1:11434/v1`；權限鍵 `model.local_self_hosted_llm`。
- 修正 `baseUrl` 以 `/v1` 結尾且無尾斜線時，`/models` 與 `/chat/completions` 路徑拼接錯誤之問題（pathname 正規化）。
- `execute` 非 2xx 與解析失敗時，錯誤訊息不再夾帶上游 response body，以降低敏感資訊外洩風險。
- 補齊 UI 設定欄位與 i18n（`en` / `zh-TW`）。
- 技術說明文件：`paperclip-official/documents/local-self-hosted-llm-adapter.md`。

## Verification（本變更相關）

- `pnpm --filter @paperclipai/server exec vitest run src/__tests__/local-self-hosted-llm-*.test.ts src/__tests__/adapter-models.test.ts src/__tests__/adapter-session-codecs.test.ts`
- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui exec vitest run src/__tests__/local-self-hosted-llm-*.test.ts`
- `pnpm --filter @paperclipai/ui typecheck`

## Notes

- `server/src/routes/billing.ts`：為通過 `tsc`，將 catch 未知錯誤格式化抽成 `formatUnknownRouteError`（與 billing 功能無行為意圖變更，僅型別安全）。
