# 本地自架 LLM Adapter 設計規格

**日期：** 2026-04-16  
**狀態：** 待實作  
**範圍：** UI/Server 權限、adapter 設定表單、連線測試、執行與轉錄（transcript）

---

## 1. 背景與目標

目前專案提供多種「AI 員工 adapter 類型」，其中本機類型（例如 `Cursor（本機）`、`Codex（本機）`）會被既有 `model.*` 權限控管，且外人看不到本機 adapter 能力。

本需求希望新增一個「本地自架 LLM」類型，讓使用者能以設定好的 `IP/Port` 與 `Model 名稱` 直接連到本地 LLM 服務（例如 Ollama）。

目標：

1. 新增一個新的 adapter type：`local_self_hosted_llm`
2. UI 顯示卡片為「本地自架 LLM」，並允許使用者填入 `Base URL / Model 名稱 / API Key（選填）`
3. 以 OpenAI-compatible endpoint 做第一版連線與測試（支援 Ollama / LM Studio / vLLM 等常見部署）
4. 權限邊界與既有本機 adapter 一致：透過 `model.local_self_hosted_llm` 控管外人可見性與可建立性
5. 後端在建立/更新 agent 時再次驗證權限與 config 合法性，不能僅靠前端隱藏

---

## 2. 用戶故事（User Stories）

1. 作為公司內的管理者/有權限成員，我可以在「新增 AI 員工」中看到「本地自架 LLM」卡片。
2. 我可以在設定中輸入 `Base URL`（預設 `http://127.0.0.1:11434/v1`）與 `Model 名稱`，並可選填 API Key。
3. 我可以按「Test Connection」確認服務可達且模型存在（或至少 endpoint 可用）。
4. 外部/無權限成員無法在 UI 中看到此 adapter 卡片，且即使繞過前端，後端也會拒絕。

---

## 3. Adapter 定義

### 3.1 Adapter Type 與顯示名稱

- adapter type：`local_self_hosted_llm`
- UI 顯示 label：`本地自架 LLM`

### 3.2 權限鍵（與既有本機 adapter 一致）

新增一個 `model.local_self_hosted_llm` 作為可用性控管。

預期修改位置：

- `@paperclipai/shared`：
  - `MODEL_PERMISSION_KEYS`
  - `ADAPTER_TYPE_TO_MODEL_PERMISSION` 映射
  - 讓 `PermissionKey` 與 `PERMISSION_KEYS` 自動納入（透過現有常數聚合方式）

預期後端行為：

- `companies/:companyId/allowed-adapter-types` 回傳的 allowed list 需包含/排除 `local_self_hosted_llm`
- 建立/更新 agent 時後端需檢查 `adapterType` 是否在 allowed list 中
- 對於無權限的讀取視角，`adapterConfig/runtimeConfig` 仍走既有 redaction（空物件或刪除敏感內容）

---

## 4. adapterConfig 資料模型（Schema）

adapterConfig（第一版）需支援以下欄位：

- `baseUrl`（string, required）
  - OpenAI-compatible endpoint base
  - 預設：`http://127.0.0.1:11434/v1`
- `model`（string, required）
  - 使用者輸入的模型名稱（例如 Ollama 的 tag）
- `apiKey`（string, optional）
  - 選填；若填入，執行時以 `Authorization: Bearer <apiKey>` 傳入
  - 若不填入，則不送 Authorization Header（或以服務不需 key 的情況為準）
- `timeoutSec`（number, optional；由通用欄位或 adapter 共通欄位繼承；若專案本身已有通用 timeout 欄位，優先沿用現有設計）
- `promptTemplate`（string, optional）
  - 由 server 端在 heartbeat build 階段合併 workflow/治理/上下文後提供的最終 prompt（如本專案目前作法）

第一版不強制加入：

- headers 自訂（避免 UI/驗證複雜化）
- 代理/憑證/自簽憑證等環境級設定（交由部署端處理）

---

## 5. UI 行為規格

### 5.1 新增 AI 員工卡片列表

- 新增卡片必須出現在「advanced adapter 選擇」階段（與既有本機 adapter 類似）
- 卡片顯示需依 `allowedAdapterTypes` 自動過濾
- 卡片 icon 與文案：
  - label：`本地自架 LLM`
  - desc：例如「OpenAI-compatible endpoint（Ollama/LM Studio/vLLM）」之類，不需過多承諾

### 5.2 adapter 設定表單（Create / Edit）

必填欄位：

- `Base URL`（string）
  - 預設：`http://127.0.0.1:11434/v1`
  - UI 提示：可填入 `http://ip:port/v1`（或依常見部署）
- `Model 名稱`（string）

選填欄位：

- `API Key`（password 欄位）

操作：

- 顯示並支援「Test Connection」

UI 需處理：

- 必填欄位檢查（空值時不送測試或顯示清楚錯誤）
- URL 格式錯誤顯示（前後端皆要有錯誤回饋；前端以即時校驗減少頻繁 API 呼叫）

---

## 6. Server 行為規格

### 6.1 Test Connection（環境測試）

`testEnvironment` 需返回 `AdapterEnvironmentTestResult`，包含多個 `checks`：

建議檢查順序與結果：

1. `local_base_url_present`（error）
2. `local_base_url_invalid`（error）
3. `local_endpoint_reachable`（warn/error）
   - 以 HEAD/GET 探測 endpoint（或至少能建立連線）
4. `local_model_list_or_chat_probe`（pass/warn/error）
   - 主要策略：呼叫 OpenAI-compatible endpoint 之模型列表（若服務支援），或以輕量 chat completion probe（例如請求很短文本、max_tokens 很小）
   - 找不到模型或返回模型錯誤時回傳 warn/fail 視產品策略：
     - 建議找不到模型為 `fail`
     - endpoint 不可達為 `fail`

### 6.2 執行（execute）

執行時呼叫 OpenAI-compatible：

- 目標 endpoint（建議）：
  - `POST {baseUrl}/chat/completions`
  - 若 `baseUrl` 已含 `/v1`，則只需拼 `/chat/completions`
- 請求內容：
  - `model`：config.model
  - `messages`：第一版以最終 prompt 直接放入 messages
  - `stream`：false（第一版簡化）
  - `temperature`：可選，若專案沒有既定欄位，先不暴露

回傳：

- adapter execution result 的 `summary` 需有可讀描述（例如「OpenAI-compatible chat completions 成功」）
- `resultJson` 可包含原始 response 的必要欄位（但不得包含明文敏感資訊）
- transcript 需要至少能呈現「模型輸出」：
  - 建議 execute 在結束前透過 `onLog("stdout", ...)` 產生可被 UI parser 解析的 JSONL 行

---

## 7. UI transcript（轉錄）格式約定（第一版）

為了讓 Run Transcript View 能正確呈現內容，建議 adapter 的 `execute()` 輸出 stdout JSONL，最終產出一個 `result` 事件或至少 `assistant` 事件。

本規格先採可實作且最小風險的策略：

1. stdout 輸出一行 JSON（JSONL）：
   - type：`local_self_hosted_llm.result`
   - text：模型輸出文字
   - inputTokens/outputTokens/costUsd（若 response 提供就填入，否則補 0）
2. UI 的 parseStdoutLine 針對本 adapter type 實作對應解析

（此處具體 JSON key 命名會在實作階段落到 code；本 spec 保留足夠描述讓實作者能保持一致。）

---

## 8. 錯誤處理規格

錯誤需區分使用者可理解的類別：

- `baseUrl` 無效（格式/協定/缺少 scheme）
- 連線失敗（服務未啟動、網路不可達、拒絕連線）
- 認證失敗（若填入 apiKey）
- 模型不存在或 endpoint 回應非預期

在 UI 顯示層面：

- `Test Connection` 顯示 error/warn 的 checks
- 給出 `hint`：例如「確認 Paperclip server 可連到該 baseUrl」「確認模型 tag 正確」

在 Server 層面：

- 非預期錯誤要回傳 errorMessage（但避免泄漏敏感 header/body）
- 對於預期錯誤狀態，以 `checks` 形式呈現，不要直接 throw（除非是不可預期的系統性錯誤）

---

## 9. 安全性（Security Considerations）

1. Adapter config 中若包含 `apiKey`，執行時必須透過 environment header 注入方式使用，不把 key 放入 promptTemplate（避免被模型看見導致外洩）
2. Server log / onMeta 必須走既有 `redactEnvForLogs` 及 `redactCurrentUserText`
3. 外部使用者不可繞過 allowed adapter types：
   - 建立/更新 agent 都會檢查 allowed list
4. OpenAI-compatible 回應內容視為不可信：
   - parse stdout transcript 時不執行任何來自 response 的指令

---

## 10. 觀測與可除錯性（Observability）

建議在 execute/testEnvironment 中記錄：

- endpoint 測試階段的 HTTP status（僅記狀態碼與少量字串，不記敏感資訊）
- 模型探測時的錯誤類型（例如 404 模型/401 auth）

並確保所有錯誤訊息對 UI 是可讀的，但不外洩：

- Authorization header
- 內部 network details

---

## 11. 實作測試計畫（Test Plan）

### 11.1 單元/整合（Server）

1. 新 adapter type 的 `testEnvironment`：
   - baseUrl 缺失、URL 格式錯誤
   - endpoint 不可達（模擬 fetch 失敗）
   - 服務回應非 2xx（回傳對應 checks）
   - 模型不存在（回傳 fail）

2. 權限：
   - `companies/:companyId/allowed-adapter-types` 在沒有權限時不回傳 `local_self_hosted_llm`
   - 即使前端傳入 adapterType，`POST /companies/:id/agents` 也必須拒絕（unprocessable/forbidden）

### 11.2 UI

1. 新 adapter 卡片顯示/隱藏：
   - allowedAdapterTypes 包含時可見
   - 不包含時不出現
2. 表單：
   - Base URL 預設值正確
   - Model 必填
3. i18n：
   - `en` 與 `zh-TW` 新增同 key 的文案

---

## 12. 自我檢查（Spec Self-Review）

1. scope 是否聚焦？：聚焦於「新增 adapter type + 權限 + 表單 + Test Connection + execute 最小鏈路」
2. 邊界是否清楚？：明確規定走 `model.*` 權限，且後端必驗證
3. 第一版是否避免過度設計？：是，先走 OpenAI-compatible + 最小 transcript 呈現
4. 是否有歧義？：openai-compatible endpoint 的固定路徑與 messages 組合策略會在實作落地（本 spec 明確了最小建議）

---

## 13. 實作落地補記（Implementation Notes）

### 13.1 OpenAI-compatible URL 拼接（`/v1` 無尾斜線）

常見 `baseUrl` 會寫成 `http://127.0.0.1:11434/v1`（**沒有**結尾 `/`）。

在 WHATWG URL 規則下，`new URL("./models", "http://host/v1")` 會錯誤解析成 `http://host/models`（丟失 `/v1` 這段 path）。因此實作採用：

- 先將 `URL.pathname` 正規化為「必要時補上結尾 `/`」
- 再用 `new URL("models", parsed)` / `new URL("chat/completions", parsed)` 產生：
  - `.../v1/models`
  - `.../v1/chat/completions`

並以單元測試鎖定 `fetch` 實際呼叫 URL，避免回歸。

### 13.2 錯誤訊息與敏感資訊

`execute` 在非 2xx 時**不回傳**上游 response body 全文（避免把供應商錯誤內容直接拼進例外字串造成外洩）；改以 HTTP status 為主的固定訊息呈現。

