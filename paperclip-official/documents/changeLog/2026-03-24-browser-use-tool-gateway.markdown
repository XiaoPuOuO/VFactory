# 2026-03-24 Browser-Use 全域工具接入（MVP）

## 變更內容

- 新增 Browser-Use Tool API 契約（shared validators）
  - `browserUseStartSchema`
  - `browserUseNavigateSchema`
  - `browserUseStateSchema`
  - `browserUseClickSchema`
  - `browserUseTypeSchema`
  - `browserUseExtractSchema`
  - `browserUseScreenshotSchema`
  - `browserUseCloseSchema`
- 新增 Paperclip server 路由：`/api/tools/browser-use/*`
  - `sessions/start`
  - `navigate`
  - `click`
  - `type`
  - `state`
  - `extract`
  - `screenshot`
  - `sessions/close`
- 新增 Node gateway service：`browser-use-gateway.ts`
  - 轉發至 Python 微服務
  - 統一回應 envelope：`ok/data/error/traceId`
  - HMAC header 產生與 service token 支援
- 新增 Python 微服務 `browser-use-service`
  - FastAPI 封裝 browser-use
  - 路由 `/v1/*` 對應 Node gateway
  - request signature 驗證
- 注入既有 adapters 的 Browser-Use API 說明（prompt note）
  - `codex-local`
  - `claude-local`
  - `cursor-local`
  - `gemini-local`
  - `opencode-local`
  - `pi-local`
- 新增路由測試：`browser-use-tools-routes.test.ts`

## 新增環境變數

- `PAPERCLIP_BROWSER_USE_SERVICE_URL`：Python 服務 URL（例如 `http://127.0.0.1:3001`）
- `PAPERCLIP_BROWSER_USE_SERVICE_SECRET`：Node <-> Python HMAC secret
- `PAPERCLIP_BROWSER_USE_SERVICE_TOKEN`：可選服務 token
- `PAPERCLIP_BROWSER_USE_DEBUG`：可選；`true`/`1`/`yes` 時預設以可見瀏覽器執行（`headless: false`），否則預設 headless（見 2026-03-25 changelog）

## 安全與治理

- Tool API 請求加入 schema 驗證（Zod）
- 基本 in-memory rate limit（每 agent/action 每分鐘 60 次）
- payload size 限制（64KB）
- 微服務簽章驗證（timestamp + nonce + HMAC）

## 執行期模組解析（生產 `node dist`）

- **問題**：workspace 套件 `package.json` 的 `exports` 先前指向 `./src/*.ts`，`tsx` 開發沒問題，但生產環境執行 `node server/dist/index.js` 時，Node 依 `exports` 載入 `.ts`，出現 `ERR_UNKNOWN_FILE_EXTENSION`。
- **作法**：`@paperclipai/db`、`@paperclipai/shared`、`@paperclipai/adapter-utils`、各 `@paperclipai/adapter-*` 的 `exports` 改為 `import`/`default` 指向 `dist`，並加上 `development` 條件指向 `src`（供 Vite / 帶 `--conditions=development` 的 `tsx` 開發）。
- **開發指令**：根目錄 `scripts/dev-runner.mjs` 與 `server` 的 `dev`／`dev:watch` 會設定 `NODE_OPTIONS=--conditions=development`，與上述 `development` export 對齊。
