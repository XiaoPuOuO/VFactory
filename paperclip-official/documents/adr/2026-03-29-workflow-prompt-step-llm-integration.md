# ADR: Company Workflow PromptStep 與 LLM 整合

**狀態**：已採納  
**日期**：2026-03-29  

## 背景

Company Skill 升級為 Workflow 後，`prompt` 類型步驟需要模型輸出並寫入 run context。Paperclip 的推論主要經由 **heartbeat → adapter.execute**，沒有獨立的 server 端「單次 completion」API。

## 決策

採用 **混合策略（B + 可選補齊）**：

1. **PromptStep 執行（Phase 1 實作）**  
   - 以 **`WorkflowPromptExecutor` 介面** 抽象：`(run, step, renderedPrompt) => Promise<string>`。  
   - **預設實作 `PlaceholderWorkflowPromptExecutor`**：不呼叫外部 LLM；將 run 標記為 `waiting_prompt_input`，並把 **待執行的渲染後 prompt** 存於 `workflow_runs` 的 `pending_prompt`（JSON 欄位）與 step log。  
   - **Board 透過 API 提交該步驟的模型輸出**（或人工貼上結果）：`POST .../workflow-runs/:runId/prompt-result`，驗證後寫入 context、推進狀態機。  
   - 理由：與 adapter 零耦合、可完整測試狀態機與 checkpoint；之後可換成 **真實 LLM adapter 實作** 同介面，無需改 API 形狀。

2. **Run 儲存**  
   - 使用 **`workflow_runs` + `workflow_step_logs` 資料表**（非 assets JSON）。

3. **YAML / 欄位**  
   - **Canonical**：`flow`（步驟陣列）；prompt 步驟內文欄位為 **`template`**。  
   - **可選別名**（Zod preprocess）：頂層 `steps` → `flow`；prompt 步驟的 `prompt` → `template`。

4. **條件語言（Phase 4）**  
   - 使用 **mini DSL**（`==`, `!=`, `contains` 等），禁止任意 `eval`。

## 後果

- UI 在 Phase 2 需支援 **「送出步驟結果」**（人工或貼上）；日後接上自動 LLM 時可隱藏該 UI 或改為後台執行。  
- `workflow_runs` 需 **`pending_prompt` jsonb**（或等價結構）存放 `stepId`、渲染後文字、建立時間。

## Checkpoint 人工確認（選配）

- `flow` 內 **`kind: checkpoint`** 可設 **`require_human_confirm`**（布林，選填）。  
- **`false`**：引擎自動視為核准（寫入 `on_approve` 分支），不進入 `waiting_checkpoint`。  
- **省略或 `true`**：需透過 UI／API 核准或拒絕（既有行為）。

## Prompt 人工提交（選配）

- **`kind: prompt`** 可設 **`require_human_input`**（布林，選填）。  
- **`false`**：不進入 `waiting_prompt`；由執行端自動產出並提交步驟結果（worker/session 或 server LLM 後援）。  
- **省略或 `true`**：需透過 UI／API 提交步驟結果（既有行為）。Loop 內層 prompt 同樣適用。

## 稽核與通知（Phase 4 補充）

- 關鍵事件（run 開始、prompt 完成、checkpoint 決策、取消、終止狀態）經 **`emitWorkflowAuditEvent`** 寫入結構化日誌（`workflow_audit` / `msg` 欄位便於搜尋）。  
- 選填環境變數 **`WORKFLOW_NOTIFY_WEBHOOK_URL`**：以 `POST` + JSON 非同步推送同一事件物件；失敗不阻斷主流程。  
- **列表 API** 支援查詢參數 **`status`**；並提供 **`GET .../workflow-runs/export.csv`**（與列表相同篩選）供離線稽核。
- **CSV 匯出安全性**：`export.csv` 對所有儲存格做 CSV 轉義，並針對以 `=`, `+`, `-`, `@` 開頭的字串做 spreadsheet formula injection 中和（保留前導空白後於值前插入單引號 `'`），避免使用者以 Excel/Sheets 開啟時被誤觸發公式。
- 啟動 run 的 `POST .../workflows/:skillKey/run` 回傳 `status` 需反映「引擎推進後」的最新狀態（不是僅回傳初始的 `running`）。

## 替代方案（未採納）

- **A**：server 內直接呼叫供應商 API — 需重複 adapter 設定與金鑰治理。  
- **C**：僅 checkpoint、prompt 仍單次注入 — 無法驗收「步驟級 context」與 run 記錄。

## 補充（2026-03-30）：Prompt 自動步驟與 Agent adapter 對齊

自動填滿 prompt 步驟（`require_human_input: false`）時，server 依 **`workflow_runs.agent_id`** 載入 Agent 的 **`adapter_type`**，將 HTTP completion 路由至對應供應商（例如 `gemini_*` → Google Generative Language API、`claude_*` → Anthropic Messages、`codex_*`／`opencode_local`／`pi_local` → OpenAI Chat Completions、`cursor` 依 **`adapter_config.model`** 字串判斷 Gemini／Claude／OpenAI）。無綁定 Agent 或 `process`／`http`／`openclaw_gateway` 時，沿用環境變數中的 OpenAI 相容路徑（`WORKFLOW_PROMPT_OPENAI_API_KEY` 或 `OPENAI_API_KEY`）以保持相容。未設定對應金鑰時回傳空字串。此為輕量 HTTP 呼叫，**不**經由 CLI `adapter.execute`。
