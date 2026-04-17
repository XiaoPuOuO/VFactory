# local_self_hosted_llm（本地自架 LLM）Adapter

## 目的

讓 Workspace 內的 Agent 透過 **OpenAI-compatible HTTP API**（例如 Ollama、LM Studio、vLLM 暴露的 `/v1` 介面）執行推論，並以既有 adapter 管線輸出 **JSONL stdout**。

## 識別與權限

- **adapterType**：`local_self_hosted_llm`（snake_case）
- **顯示名稱（UI）**：「本地自架 LLM」
- **模型權限鍵**：`model.local_self_hosted_llm`（`ADAPTER_TYPE_TO_MODEL_PERMISSION` 映射）
- **非 admin 預設不可建立**：此型別 **不在** `NON_ADMIN_ALLOWED_ADAPTER_TYPES`；是否允許由公司權限矩陣決定（與其他本機類 adapter 一致）。

## 必要設定（adapterConfig）

| 欄位 | 必填 | 說明 |
|------|------|------|
| `baseUrl` | 是 | OpenAI-compatible **base**，預設為 `http://127.0.0.1:11434/v1`（伺服端在缺值時補齊）。僅允許 `http` / `https`，且必須可被 `URL` 解析。 |
| `model` | 是 | 送往 `chat/completions` 的模型 id（字串需非空）。 |
| `promptTemplate` | 否 | 作為單一 user message 內容送進 `messages`。 |
| `apiKey` | 否 | 若設定，請求會帶 `Authorization: Bearer <apiKey>`。 |
| `cwd` | 否 | 與其他 adapter 一致；非空時會一併序列化進設定。 |

> 伺服端約束：`paperclip-official/server/src/routes/agents.ts` 的 `assertAdapterConfigConstraints` 會驗證 `baseUrl` / `model` 與 URL scheme。

## 執行語意（execute）

- 呼叫：`POST {baseUrl}/chat/completions`（會將 `baseUrl` 的 pathname **正規化**，避免 `.../v1` 無尾斜線時路徑拼接錯誤）。
- 參數：`stream: false`，`messages` 為單一 user role。
- 成功：解析 JSON 後輸出一行 JSONL：`{ "type": "local_self_hosted_llm.result", ... }`（細節以 `execute.ts` 與測試為準）。
- 失敗：**不回傳上游 response body** 至錯誤字串（降低敏感資訊外洩）；以固定/保守訊息為主。

## 環境檢測（testEnvironment）

- 以 `GET {baseUrl}/models`（同樣經 pathname 正規化後 resolve）驗證連線與 OpenAI-compatible 模型列表端點是否可用。

## 相關程式位置（維護索引）

- 伺服端 adapter：`paperclip-official/server/src/adapters/local-self-hosted-llm/`
- UI adapter：`paperclip-official/ui/src/adapters/local-self-hosted-llm/`
- 建立公司／CEO 引導精靈（Onboarding）的適配器清單：`paperclip-official/ui/src/components/OnboardingWizard.tsx`（「更多適配器」區塊需與 `NewAgentDialog` 等處一併維護）
- 共用常數：`paperclip-official/packages/shared/src/constants.ts`
- 設計補記（URL 拼接與錯誤處理政策）：`docs/superpowers/specs/2026-04-16-local-self-hosted-llm-design.md`

## 營運注意事項

- 此 adapter 預設指向本機 loopback；多租戶或遠端執行時請確認 **網路邊界** 與 **權限授與**（僅授與可信公司/管理員）。
- 上游若回傳非 JSON 或結構不符合預期，執行會失敗；請以 `testEnvironment` 先行驗證 `baseUrl` 與權杖設定。
