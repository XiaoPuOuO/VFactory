# 2026-03-25 Browser-Use 除錯可見模式（PAPERCLIP_BROWSER_USE_DEBUG）

## 變更內容

- 新增環境變數 **`PAPERCLIP_BROWSER_USE_DEBUG`**（`true` / `1` / `yes` 視為開啟）：
  - 開啟：啟動瀏覽器 session 時預設 **`headless: false`**（人類可見視窗）。
  - 關閉或未設：預設 **`headless: true`**（背景）。
- 若請求已在 `sessions/start` 的 `toolInput` 明確帶入 **`headless`**，則以呼叫端為準，不覆寫。
- **Paperclip** `browser-use-gateway.ts` 在轉發 `sessions/start` 前補齊預設；**Python** `browser-use-service/app.py` 在 `_init_browser_session` 傳入相同語意（直接打 Python 時亦生效）。
- 單元測試：`server/src/__tests__/browser-use-gateway.test.ts`。
- 文件：`README.md`、`browser-use-service/README.md`、`.env.example`。
