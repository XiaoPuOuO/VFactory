# Browser-Use Service

Paperclip 的 Browser-Use 微服務封裝，提供 `/v1/*` 端點給 `server` 轉發呼叫。

## 啟動（本機，不用 Docker）

在 **`paperclip-official/browser-use-service`** 目錄：

```bash
cd paperclip-official/browser-use-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

與 Paperclip **同一組** secret／token（與 `paperclip-official/.env` 一致）：

```bash
export PAPERCLIP_BROWSER_USE_SERVICE_SECRET="與-Paperclip-.env-相同"
export PAPERCLIP_BROWSER_USE_SERVICE_TOKEN="若有設定則與-Paperclip-相同-可選"
# 與 Paperclip `.env` 一致：true/1/yes = 顯示瀏覽器視窗；未設 = headless 背景執行
export PAPERCLIP_BROWSER_USE_DEBUG=true
uvicorn app:app --host 127.0.0.1 --port 3001
```

`PAPERCLIP_BROWSER_USE_DEBUG` 會在 **`sessions/start`** 時決定是否 **headless**（若請求未明確帶 `toolInput.headless`）。Paperclip gateway 也會依同一變數補齊預設，兩邊請設成相同以免行為不一致。

確認服務：`http://127.0.0.1:3001/docs` 能開啟即成功。

### 與 Paperclip 一起用

1. **Paperclip** `paperclip-official/.env` 需包含（與上面 secret 一致）：

   - `PAPERCLIP_BROWSER_USE_SERVICE_URL=http://127.0.0.1:3001`
   - `PAPERCLIP_BROWSER_USE_SERVICE_SECRET=...`
   - `PAPERCLIP_BROWSER_USE_SERVICE_TOKEN=...`（可選，有設兩邊都要）

2. 另開終端機在 **`paperclip-official`** 根目錄啟動主程式：

   ```bash
   pnpm dev
   ```

先開 Browser-Use（3001），再開 Paperclip；關閉時兩邊各自 Ctrl+C 即可。

## 如何確認 AI 真的會開瀏覽器／呼叫工具

1. 在 **Paperclip** 與 **browser-use-service** 的環境都設 `PAPERCLIP_BROWSER_USE_DEBUG=true`，重啟兩個行程。
2. 建立或選一個會跑 **本機 adapter**（例如 `claude-local` / `codex-local`）的 Issue／Agent，在任務裡明確要求：「用 Browser-Use 開啟某個 HTTPS 頁面並回報標題」（模型需依系統提示呼叫 `/api/tools/browser-use/*`）。
3. 若 **debug 開啟**，啟動 session 後應出現 **可見的 Chromium 視窗**；若為 **headless**，則不會跳出視窗，但可在 Paperclip 活動紀錄與 Python 日誌看到 tool 呼叫。
4. 快速自測（不依賴 LLM）：對 Paperclip 後端以 **Agent JWT** 呼叫 `POST /api/tools/browser-use/sessions/start`（需帶 `agentId`、`runId`、`toolInput`），再檢查本機是否出現瀏覽器；細節見上游 API 與 `browser-use-tools-routes` 驗證規則。

## 安全

- 必須設定 `PAPERCLIP_BROWSER_USE_SERVICE_SECRET`
- 可選 `PAPERCLIP_BROWSER_USE_SERVICE_TOKEN`，若設定則必須匹配 header `x-tool-token`
- 每次請求需附帶 HMAC 簽章 headers：
  - `x-tool-signature`
  - `x-tool-timestamp`
  - `x-tool-nonce`
