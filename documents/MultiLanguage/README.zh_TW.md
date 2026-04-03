# Paperclip — AI 代理人編排平台

> **Language / 語言：** [English](../../README.md) · [简体中文](README.zh_CN.md)

一個**可自行部署、生產就緒的 AI 程式碼代理人控制平面** —— fork 自 [paperclipai/paperclip](https://github.com/paperclipai/paperclip)，並擴充了**公司層級工作流程**（類 SOP 自動化）、瀏覽器自動化、跨對話持久記憶、更豐富的成本分析，以及多項 UX 改進。**browser-use** 函式庫以 **Git 子模組**置於倉庫根目錄（`browser-use/`）；子模組遠端為 **[XiaoPuOuO/browser-use](https://github.com/XiaoPuOuO/browser-use)**（含少量下游補丁之 fork）。**官方上游**專案仍為 **[browser-use/browser-use](https://github.com/browser-use/browser-use)**（issue、發行版與授權歸屬）。選用的 Python 微服務以 **可編輯安裝（`-e`）** 對齊該子模組目錄。

---

## 這是什麼？

Paperclip 將 AI 程式碼代理人（Claude、Codex、Gemini、Cursor 等）轉化為在你自己基礎設施中運作的**受管理團隊成員**。它提供：

- 一個**中央控制平面**，用於建立、排程並監控跨多個代理人的任務（稱為 *Issue*）
- 一個**即時執行環境**，代理人在此簽出工作、執行，並將結果回報給伺服器
- 一個**審核與治理層**，讓人類可以在變更落地前進行審查、拒絕或修訂
- 一個**成本與預算引擎**，讓你隨時掌握每個代理人、專案或計費代碼的支出
- 一個**瀏覽器自動化能力**，讓代理人能與即時網頁互動，而不只是讀取靜態檔案

本倉庫是上游 Paperclip 的**自訂 Fork**，保留所有上游功能並疊加：

| 新增功能 | 描述 |
|---|---|
| Browser-Use 微服務 | 將 `browser-use` Python 函式庫封裝成安全的 FastAPI 服務；代理人可開啟、瀏覽並操作真實的 Chromium 瀏覽器 |
| Instance Sidebar | 可折疊、可調整寬度的實例層級導覽側邊欄 |
| Instance Settings UI | 完整的實例管理設定面板 |
| Agent Tree & Model Filtering | 依模型、狀態或層級篩選代理人列表 |
| Cost Charts | 依代理人、專案和計費代碼的互動式成本明細圖表；**提示快取權杖**（`cachedReadTokens`／`cachedWriteTokens`）寫入 `cost_events` 並納入彙總、CSV 與圖表 |
| Execution Labels | 在 Run 上顯示當前執行狀態的視覺標籤 |
| Issue / 子任務喚醒 | 子任務完成或 Issue 更新時，自動喚醒父代理人 |
| 可調整寬度側邊欄 | 整個 UI 中可拖曳調整的側邊欄面板 |
| 公司工作流程 | 視覺化流程編輯、執行紀錄、Worker 審核與可選的 LLM Prompt 步驟；側欄與路由為 `/company/workflows`（舊路徑 `/company/skills` 會轉址） |
| `browser-use` 子模組 | 不再以整包原始碼納入主倉庫 —— 以子模組提交鎖定上游版本；於 `browser-use-service` 內以 `-e ../../browser-use` 安裝 |
| 可觀測性 | 公司範圍 **服務日誌** API + DB（`application_log_entries`）；**Prometheus** 格式 **`GET /metrics`**（可選 scrape token），並由 Express **`observability-http`** 中介層將各路徑延遲與狀態碼寫入 **`server/src/telemetry/`**；**平台告警** webhook 可自外部監控建立 Issue |
| CI／交付 | 根目錄 **GitHub Actions**（僅 `paperclip-official/` 變更時觸發）執行 typecheck、測試、build、`security:audit`；**`deploy-with-rollback.sh`** 支援 symlink 部署、健康檢查與回滾 |
| Roadmap／覆寫 | **版本化 Roadmap** 與 **human override** 資料表 + REST API；可選 **materialize** 將 Markdown 清單列轉為 backlog Issue；自主決策優先序規則；可選 **Watchdog** 於 reap orphan run 時建立 escalation Issue |

---

## 為什麼有這個專案？

大多數 AI 代理人工具都陷入以下陷阱之一：

**1. 雲端專屬的供應商鎖定** —— 你的程式碼、對話和機密都存到別人的伺服器。切換供應商很痛苦，稽核根本無從實現。

**2. 缺乏協作** —— 個別的代理人工具一次只能運行一個代理人。沒辦法將任務指派給不同的代理人、以團隊方式追蹤進度、透過審核把關變更，或彙整跨專案的成本。

**3. 無法存取真實瀏覽器** —— 代理人能推理和撰寫程式碼，但無法登入 staging 環境、填寫表單，或驗證部署的功能在瀏覽器中是否真的能運作。

**本 Fork 解決以上三點：**

- 一切運行在你自己的基礎設施中，無任何遙測資料離開你的環境。
- Issues、代理人、審核、成本、目標和排程都是由單一後端管理的一等公民實體。
- Browser-Use 微服務透過安全的內部 API，為任何代理人提供真實的、可腳本化的 Chromium 瀏覽器。

---

## 架構

```
┌──────────────────────────────────────────────────────────────────┐
│                  Web UI  (React 19 / Vite 6)                     │
│  Dashboard · Issues · Agents · Costs · Approvals · Chat · ...    │
└────────────────────────┬─────────────────────────────────────────┘
                         │  REST + WebSocket（即時事件）
┌────────────────────────▼─────────────────────────────────────────┐
│                  Server  (Node.js / Express 5)                    │
│                                                                   │
│  路由                            服務                             │
│  ──────────────────────          ────────────────────────────     │
│  issues · agents · chat · company-skills · workflow-runs   heartbeat（Run 編排）             │
│  approvals · costs · goals       agent-memories（跨對話記憶）      │
│  schedules · projects            browser-use-gateway（HMAC 代理） │
│  service-logs · roadmap ·        應用程式日誌 · 指標               │
│  platform-alerts（webhook）      （Prometheus 文字／告警→Issue）   │
│  plugins · secrets               realtime（WebSocket 廣播）       │
│  instance/* · scim               cost / budget 強制執行           │
│                                                                   │
│  Auth: Better Auth · Agent JWT · SCIM 配置                        │
│  運維: GET /api/health · GET /metrics（選用）· HTTP 指標中介層 · CI 於 .github │
│  DB:   PostgreSQL + Drizzle ORM（本機開發可用 embedded-postgres）  │
└──────┬──────────────────────────────────────┬────────────────────┘
       │  adapter spawn / heartbeat           │  HMAC-signed HTTP
┌──────▼──────────────────────┐   ┌───────────▼────────────────────┐
│        Agent Adapters        │   │     Browser-Use Service        │
│                              │   │     (Python / FastAPI)         │
│  claude-local  (Claude CLI)  │   │                                │
│  codex-local   (Codex CLI)   │   │  /v1/sessions/start            │
│  cursor-local  (Cursor IDE)  │   │  /v1/navigate                  │
│  gemini-local  (Gemini CLI)  │   │  /v1/state                     │
│  opencode-local              │   │  /v1/click  /v1/type           │
│  pi-local                    │   │  /v1/extract /v1/screenshot    │
│  openclaw-gateway (WebSocket)│   │  /v1/sessions/close            │
└──────────────────────────────┘   └────────────────────────────────┘
```

---

## 功能說明

### Issues — 任務管理

Issue 是工作的基本單位，每個 Issue 可以：

- 指派給特定代理人，或放入可供任何代理人領取的任務池
- 加上標籤、連結到專案，並關聯到父目標
- 被代理人簽出（防止平行編輯），然後釋出或完成
- 被團隊成員訂閱以獲得即時通知
- 附上留言和檔案附件
- 整理成帶有自訂篩選的已儲存視圖

當子任務（子 Issue）解決或 Issue 被代理人更新時，**checkout wake-up** 機制會自動恢復任何等待中的父代理人，無需人工輪詢。

---

### Agents — 多 Adapter 執行

每個代理人由以下其中一種 Adapter 類型支援。Adapter 決定 Paperclip 如何產生、與底層 AI 行程溝通，以及監控其狀態。

| Adapter | 後端 | 傳輸方式 |
|---|---|---|
| `claude-local` | Anthropic Claude Code CLI | stdio / process spawn |
| `codex-local` | OpenAI Codex CLI | stdio / process spawn |
| `cursor-local` | Cursor IDE agent | stdio / process spawn（stream-json 會解析 **`cached_input_tokens`** 及分立的 **cache 讀／寫** 欄位，若上游有提供） |
| `gemini-local` | Google Gemini CLI | stdio / process spawn |
| `opencode-local` | OpenCode agent | stdio / process spawn |
| `pi-local` | Pi agent | stdio / process spawn |
| `openclaw-gateway` | 任何遠端代理人 | WebSocket（challenge → connect → run） |

**每個代理人可設定：**
- `model` — 使用的模型版本
- `cwd` — 檔案操作的工作目錄
- `instructionsFilePath` — 自訂系統提示詞檔案路徑
- `workspaceStrategy` — 每次執行使用隔離的 git worktree（支援平行執行）
- `workspaceRuntime` — 注入工作區的 runtime 服務
- `timeoutSec` — 執行硬性時間限制

**Heartbeat 系統：**
伺服器的 Heartbeat 服務負責協調完整的執行生命週期 —— 配置工作區、注入技能與記憶、即時串流事件、強制執行成本預算、記錄 Run 日誌，並在完成時觸發喚醒回呼。

---

### Browser-Use — AI 原生瀏覽器自動化

**Browser-Use 微服務**（Python / FastAPI）封裝 **`browser-use/` 子模組**內的程式（見上段 fork 與上游說明），並以已簽章的內部 REST API 方式暴露出來。任何代理人都可取得瀏覽器 Session 並執行真實互動。若為函式庫本身的**上游**問題或功能建議，請至官方 **[browser-use/browser-use](https://github.com/browser-use/browser-use)** 追蹤，除非變更僅適用本 fork。

**可用操作**（皆為 `POST`，並以簽章的 JSON 信封承載參數）：

| 端點 | 功能 |
|---|---|
| `POST /v1/sessions/start` | 啟動 Chromium 瀏覽器 Session（headless 或可見模式） |
| `POST /v1/navigate` | 在 Session 中載入 URL |
| `POST /v1/state` | 截取當前頁面狀態（DOM 快照、URL、標題） |
| `POST /v1/click` | 依頁面狀態索引或座標點擊元素 |
| `POST /v1/type` | 在聚焦元素中輸入文字 |
| `POST /v1/extract` | 從頁面擷取結構化資料 |
| `POST /v1/screenshot` | 截圖並以 base64 回傳 |
| `POST /v1/sessions/close` | 終止並清理 Session |

**安全模型：** Node 閘道對 Python 服務的每個請求都以 HMAC-SHA256 簽章驗證。必須包含三個 Header：`x-tool-signature`、`x-tool-timestamp` 和 `x-tool-nonce`。時間戳在 ±5 分鐘視窗內驗證；**nonce 需寫入 Redis**（`PAPERCLIP_REDIS_URL` 或 `PAPERCLIP_BROWSER_USE_NONCE_REDIS_URL`）以避免多實例重放。可選的 `x-tool-token` Header 提供第二層驗證。

**除錯模式：** 在 Node 伺服器和 Python 服務兩側都設定 `PAPERCLIP_BROWSER_USE_DEBUG=true`，Session 將以非 headless 模式運行 —— 螢幕上會出現真實的 Chromium 視窗以便目視除錯。

---

### Agent 記憶 — 跨對話持久上下文

代理人可在對話室和 Session 間累積個人記憶庫。

- 事實、觀察和決策以結構化記憶條目寫入
- 記憶服務摘要較舊的條目以維持在 Token 預算範圍內（可設定字元上限）
- 在每次新對話開始時，相關記憶會被自動擷取並注入系統提示
- 記憶以代理人為單位，可依關鍵字或來源聊天室搜尋

這讓長期運行的代理人能保持連貫性 —— 知道上週做了什麼、做了什麼決策，以及遇到了什麼問題。

---

### 公司工作流程 — 類 SOP 自動化

公司可定義**工作流程**：多步驟流程（條件、審核、HTTP、LLM Prompt、Worker 交接等），附**視覺化編輯器**、**執行紀錄**，並與 heartbeat／代理人 Run 整合。常見用途包含標準作業程序、帶審核的發布與有副作用動作前的人工確認。側欄入口為**工作流程**（`/company/workflows`）；舊書籤 `/company/skills` 仍會轉址。

---

### Approvals — 人工介入治理

在代理人提議的變更被接受之前，可以透過審核工作流程進行把關。

- **審核政策**在公司層級定義並自動套用
- 審核者可以**核准**、**拒絕**或**要求修訂**並附上留言
- 修訂內容回送給代理人，代理人重新執行後再次提交
- **自動後續追蹤**追蹤過期的審核並發送提醒
- 完整的審核歷程可匯出為 CSV 供合規使用

---

### 可觀測性、CI/CD 與 Roadmap 治理（本 Fork）

除 Pino **stdout／本機檔案** 外，本 Fork 另提供**平台級**能力：

| 面向 | 說明 |
|---|---|
| **服務日誌** | 結構化資料存於 PostgreSQL（`application_log_entries`）；經公司範圍 **service-logs** 路由查詢／寫入（需 RBAC）。與 **`activity_log`（稽核）** 及原始 Pino 檔案不同。 |
| **指標** | **`GET /metrics`** 輸出 Prometheus 文字（經 `observabilityHttpMetrics` 記錄各路徑 HTTP 耗時／狀態、5xx、排程／heartbeat tick 錯誤等）。設定 `PAPERCLIP_METRICS_ENABLED=true`；可選 `PAPERCLIP_METRICS_SCRAPE_TOKEN` 以 Bearer 保護。 |
| **告警→Issue** | **`POST /api/webhooks/platform-alerts`**，標頭 **`X-Paperclip-Alert-Token`** 須與 **`PAPERCLIP_ALERT_WEBHOOK_SECRET`** 一致（body 經 Zod 驗證）。可接 Alertmanager 或雲端監控（依文件調整 payload）。 |
| **CI** | 根目錄 **`.github/workflows/paperclip-ci.yml`** 於 `paperclip-official/**` 變更時執行：`pnpm -r typecheck`、`pnpm test:run`、`pnpm build`、`pnpm run security:audit`（生產依賴、預設 critical 閾值，可於 `package.json` 調整）。 |
| **部署／回滾** | **`paperclip-official/scripts/deploy-with-rollback.sh`**：解壓 artifact、切換 **`current`** symlink、可選 **`PAPERCLIP_HEALTH_URL`**；失敗還原上一版；可選 **`PAPERCLIP_ACTIVITY_URL`** POST 稽核。 |
| **Roadmap** | **`roadmap_versions`**／**`roadmap_human_overrides`** 與 API（**`/api/companies/:companyId/roadmap/...`**）。**`POST .../versions/:versionId/materialize`** 將 `-`／`*` Markdown 列轉為 backlog Issue（有上限）。 |
| **安全** | Workflow／技能步驟可標 **`dangerous`** —— 仍須人工審批。伺服器端另有 **`dangerous-action-registry`** 與 **`planning-priority`** 協助一致的把關與規劃優先序。**`redaction.ts`** 強化敏感鍵遮蔽。 |
| **Watchdog** | 若 **`PAPERCLIP_WATCHDOG_ESCALATION_ISSUES=true`**，reap 孤兒 heartbeat run 時可為受影響公司建立高優先 Issue。 |

延伸閱讀（勿將密鑰寫入版本庫）：**`paperclip-official/documents/runbooks/diagnostician-alert-issue.md`**、**`paperclip-official/documents/ai-company-open-questions.md`**。

---

### Costs — 支出可視化

每個代理人發出的每個 LLM 呼叫都被記錄為成本事件。

**彙整視圖：**
- 依代理人
- 依專案
- 依計費代碼
- 公司整體彙整
- UI 中的互動式時間序列圖表

**提示快取計帳：** 成本列與彙總包含 **快取讀取** 與 **快取寫入** 權杖數（migration 擴充 `cost_events` 與 `agent_runtime_state`）。**`cursor-local`** 等 Adapter 會將 Cursor `result.usage` 對應到 heartbeat 用量，使快取命中與輸入／輸出權杖一併呈現於 UI 與匯出。

**預算強制執行：**
- 為每個公司或代理人定義預算政策
- 伺服器強制執行硬性限制 —— 超出預算的代理人會在執行中途被暫停
- `limit_breach_events` 記錄以供稽核
- CSV 匯出供外部會計使用

---

### 目標與排程

**目標**為代理人提供超越個別 Issue 的方向：
- 連結高層次目標與具體 Issue 的層級目標樹
- 帶時間範圍查詢的進度追蹤
- UI 中的視覺化目標地圖

**排程**讓你自動化重複性工作：
- `cron` 表達式用於週期性觸發
- `once` 用於一次性未來任務
- `ranges` 用於有界限的重複視窗
- 衝突偵測防止排程重疊

---

### 團隊與多租戶

- **多租戶：** 一個 Paperclip 實例可以託管多個完全資料隔離的獨立公司
- **SCIM：** 從企業身份驗證供應商（Okta、Azure AD 等）自動配置和取消配置使用者
- **RBAC：** 公司和實例層級的細緻角色型存取控制
- **Instance 群組：** 將使用者組織成具有繼承權限的群組
- **Integration Token：** 為 CI/CD Pipeline 和外部工具發行範圍限定的 API Token
- **Webhook：** 訂閱公司事件並接收即時 HTTP 回呼

---

### Secrets 管理

- Secret 以加密形式儲存在資料庫中（`company_secrets` 帶版本控制）
- 代理人透過 runtime 環境接收 Secret —— 絕不透過對話訊息傳遞
- Secret 從所有日誌輸出中自動遮蔽
- CLI 指令支援輪換和列出 Secret

---

### 插件系統

在不 Fork 的情況下擴充 Paperclip：
- 插件在伺服器啟動時註冊
- 每個插件可以新增路由、將上下文注入代理人 Run，或掛勾生命週期事件
- `company_plugins` 表儲存每個公司的插件設定
- 第一方插件列於插件目錄；自訂插件放入 plugins 目錄即可

---

### CLI — `paperclipai`

CLI 是管理 Paperclip 實例的運維人員的主要工具。

| 指令 | 用途 |
|---|---|
| `onboard` | 互動式首次設定精靈 |
| `run` | 執行 onboard → doctor → 啟動完整服務 |
| `doctor [--repair]` | 跨所有子系統的健康檢查；自動修復模式 |
| `configure` | 編輯 LLM、資料庫、日誌、伺服器、儲存和 Secrets 設定 |
| `env` | 管理環境變數 |
| `db:backup` | 備份 PostgreSQL 資料庫 |
| `db:restore` | 從備份還原 |
| `allowed-hostname` | 管理私有模式的信任主機名稱 |
| `auth bootstrap-ceo` | 產生第一個管理員邀請連結 |
| `heartbeat run` | 執行單次 Heartbeat 並串流日誌 |
| `company` | 透過 API 建立、列出和管理公司 |
| `issue` | 透過 API 建立、列出、指派和關閉 Issue |
| `agent` | 透過 API 列出、設定和管理代理人 |
| `approval` | 透過 API 審查和解決審核 |
| `activity` | 串流即時活動日誌 |
| `dashboard` | 顯示摘要儀表板 |
| `worktree` | 管理平行代理人執行的 git worktree |

---

### Web UI — 頁面

| 頁面 | 功能 |
|---|---|
| Dashboard | 活躍代理人、開放 Issue 和近期成本的高層次概覽 |
| Issues | 列出、篩選（已儲存視圖）、建立和管理 Issue |
| Issue Detail | 完整 Issue 視圖：聊天記錄、Run 歷程、審核、留言、附件 |
| Agents | 帶模型/狀態篩選的樹狀視圖；建立和設定代理人 |
| Agent Detail | 設定、Run 歷程、成本明細、記憶瀏覽器、即時 Run 視圖 |
| Run Quality | 跨所有 Run 的彙整品質指標和錯誤叢集 |
| Projects | 將 Issue 組織進帶有共用工作區的專案 |
| Goals / Goal Map | 連結至 Issue 的視覺化目標層級 |
| Schedules | 建立和管理定時觸發器 |
| Approvals | 帶 diff 視圖和留言串的審核佇列 |
| Costs | 依代理人、專案和計費代碼的互動式成本圖表 |
| Chat | 與代理人的直接對話；基於聊天室的對話歷程 |
| Governance | 自動化規則、審核政策、Webhook 和通知設定 |
| Activity | 公司整體活動日誌 |
| Inbox | 通知和未讀項目 |
| Instance Settings | 使用者管理、群組權限、SCIM 金鑰、合規保留、封存公司 |
| Workflows（工作流程） | 公司層級 SOP／流程設定；側欄與路由為 `/company/workflows`（舊路徑 `/company/skills` 會轉址） |
| Org Chart | 視覺化代理人層級和匯報結構 |

---

## 技術棧

| 層級 | 技術 |
|---|---|
| 執行環境 | Node.js ≥ 20，pnpm ≥ 9（Monorepo） |
| 後端 | TypeScript、Express 5、Zod 驗證、Pino 日誌 |
| 資料庫 | PostgreSQL、Drizzle ORM、embedded-postgres（本機開發） |
| 認證 | Better Auth、Agent JWT、SCIM 2.0 |
| 即時通訊 | WebSocket（即時 Run 事件、聊天） |
| 前端 | React 19、Vite 6、TanStack Query、React Router 7、react-i18next |
| 測試 | Vitest（單元）、Playwright（E2E） |
| 瀏覽器自動化 | Python ≥ 3.11、FastAPI、browser-use、Playwright/Chromium |
| CI 封裝 | pnpm workspaces、TypeScript 專案參考 |
| 倉庫 CI | GitHub Actions：`.github/workflows/paperclip-ci.yml`（僅 `paperclip-official/`） |

---

## 快速開始

### 前置需求

- Node.js ≥ 20，pnpm ≥ 9
- Python ≥ 3.11
- PostgreSQL（或本機開發使用 embedded-postgres）
- **Redis** — 成本快取、工作流程協調，以及 **Browser-Use HMAC nonce** 儲存（與 Paperclip 共用 URL 或單獨指定 nonce 用 URL）

### 複製倉庫

```bash
git clone --recurse-submodules <你的-fork-或-clone-網址> Paperclip
cd Paperclip
```

若先前未帶子模組：

```bash
git submodule update --init --recursive
```

### 1. 啟動 Browser-Use 服務

`requirements.txt` 以可編輯方式安裝倉庫根目錄的 **`browser-use` 子模組**（`-e ../../browser-use`），請先完成上一節 **複製倉庫**。

```bash
cd paperclip-official/browser-use-service

python3 -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 必須與 paperclip-official/.env 一致（Redis 為 nonce 防重放所需）
export PAPERCLIP_REDIS_URL="redis://127.0.0.1:6379"
export PAPERCLIP_BROWSER_USE_SERVICE_SECRET="your-shared-secret"
export PAPERCLIP_BROWSER_USE_DEBUG=true    # 可選：顯示瀏覽器視窗

uvicorn app:app --host 127.0.0.1 --port 3001
```

確認服務運行：開啟 `http://127.0.0.1:3001/docs`。

### 2. 設定並啟動 Paperclip

```bash
cd paperclip-official

cp .env.example .env
# 在 .env 中新增：
# PAPERCLIP_REDIS_URL=redis://127.0.0.1:6379
# PAPERCLIP_BROWSER_USE_SERVICE_URL=http://127.0.0.1:3001
# PAPERCLIP_BROWSER_USE_SERVICE_SECRET=<與上方相同的 secret>
# PAPERCLIP_BROWSER_USE_DEBUG=true   （可選，與服務端保持一致）

pnpm install
pnpm dev
```

網頁 UI 將在 `http://localhost:3000` 上可用。

### 3. 首次設定

執行 onboard 精靈以設定資料庫、LLM 供應商和管理員帳號：

```bash
pnpm paperclipai onboard
```

或使用 doctor 驗證一切正常：

```bash
pnpm paperclipai doctor
```

### 4. 驗證瀏覽器自動化

指派代理人一個如下的任務：

> "Use Browser-Use to open https://example.com and report the page title."

設定 `PAPERCLIP_BROWSER_USE_DEBUG=true` 後，當代理人呼叫瀏覽器工具時，應出現可見的 Chromium 視窗。

---

## 專案結構

```
Paperclip/
├── README.md                             ← 英文主 README
├── .github/
│   └── workflows/
│       └── paperclip-ci.yml              ← paperclip-official 的 CI（路徑過濾）
├── browser-use/                          ← Git 子模組：上游 browser-use（提交由 gitlink 鎖定）
├── documents/
│   ├── MultiLanguage/
│   │   ├── README.zh_TW.md               ← 本檔案（繁體中文）
│   │   └── README.zh_CN.md               ← 簡體中文
│   └── changeLog/                        ← 自動化變更紀錄
└── paperclip-official/
    ├── documents/
    │   ├── adr/                          ← 架構決策紀錄（選讀）
    │   ├── runbooks/                     ← 例：告警診斷 runbook
    │   └── ai-company-open-questions.md  ← 環境／部署開放問題（參考）
    ├── scripts/
    │   ├── release-preflight.sh          ← 發布閘門（typecheck、test、build）
    │   └── deploy-with-rollback.sh       ← Symlink 部署＋健康檢查＋回滾（選用）
    ├── browser-use-service/              ← Python 瀏覽器自動化服務
    │   ├── app.py                        ← FastAPI + HMAC 驗證 + browser-use
    │   └── requirements.txt              ← 可編輯安裝：../../browser-use
    ├── cli/                              ← paperclipai CLI
    │   └── src/
    │       ├── index.ts                  ← 指令註冊
    │       └── commands/                 ← 各指令實作
    ├── server/                           ← Node.js 後端
    │   └── src/
    │       ├── app.ts                    ← Express 應用程式組裝
    │       ├── routes/                   ← REST 路由處理器
    │       ├── middleware/               ← 例：可觀測性 HTTP 指標
    │       ├── telemetry/                ← Prometheus 輔助模組
    │       ├── lib/                      ← 例：dangerous-action-registry、planning-priority
    │       └── services/                 ← 業務邏輯（heartbeat、記憶、成本等）
    ├── ui/                               ← React 前端
    │   └── src/
    │       ├── pages/                    ← 所有 UI 頁面
    │       ├── components/               ← 共用元件
    │       └── locales/                  ← i18n 字串
    ├── packages/
    │   ├── adapters/                     ← Agent Adapter 套件
    │   │   ├── claude-local/
    │   │   ├── codex-local/
    │   │   ├── cursor-local/
    │   │   ├── gemini-local/
    │   │   ├── opencode-local/
    │   │   ├── pi-local/
    │   │   └── openclaw-gateway/
    │   ├── db/                           ← Drizzle Schema + Migrations
    │   ├── shared/                       ← 跨套件共用的 Zod 型別
    │   └── adapter-utils/                ← 共用 Adapter 工具函式
    └── AgentSetting/                     ← 代理人規則、技能、提示詞
        └── promptTemplate/               ← 選用之版本化提示詞範本（Markdown）
```

---

## 來源與授權

| 元件 | 上游 | 授權 |
|---|---|---|
| Paperclip | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT — Copyright (c) 2025 Paperclip AI |
| Browser-Use（官方上游） | [browser-use/browser-use](https://github.com/browser-use/browser-use) | MIT — Copyright (c) 2024 Gregor Zunic |
| Browser-Use（本倉庫子模組） | [XiaoPuOuO/browser-use](https://github.com/XiaoPuOuO/browser-use) | 同 MIT；含少量下游補丁之 fork |

完整授權文字：`paperclip-official/LICENSE`。
