# ADR：Worker 驅動 Workflow 與節點級核准

**狀態**：已採納  
**日期**：2026-03-30  

## 背景

Workflow 若每一步都重新排程完整 heartbeat，冷啟與延遲成本高。產品目標是：**同一 AI 員工、同一 adapter session** 內，依 server 狀態機自動接續多個步驟；必要時在節點前暫停等待 **Allow／Deny（附原因重試同一步）／Cancel**。

## 決策

1. **狀態**  
   - `waiting_worker`：當前步驟由 **該 run 綁定之 agent** 於 session 內執行；`pending_worker` 存 `stepId`、`kind`、`payload`。  
   - `waiting_approval`：節點勾選 `require_approval_before` 時進入；`pending_approval` 存 gate、說明文字。

2. **Server 填字路徑**  
   - 預設 **不以** HTTP LLM 為主路徑；需 `agentId` 時進入 `waiting_worker`。  
   - 僅在設定 **`WORKFLOW_SERVER_PROMPT_LLM=1`**（或 `true`/`yes`）時，保留既有 `workflow-prompt-llm` server 端補字作為後援。

3. **API**  
   - `POST .../workflow-runs/:runId/approval` — body `{ decision: allow|deny|cancel, reason? }`。  
   - `POST .../workflow-runs/:runId/worker-step-result` — body 符合 `WorkflowStepWorkerResult`（Zod，`schemaVersion: 1`）。  
   - `start` 可選 `chatRoomId` 以利聊天側綁定。

4. **Heartbeat 銜接**  
   - 當該 agent 存在 `waiting_worker` 的 run 時，於 heartbeat 組 prompt 前將 **`paperclipWorkflowPendingWorker`** 注入 context，並附加一段說明如何呼叫 `worker-step-result`（同 session 續跑之意圖）；同時設 **`paperclipWorkflowSuppressChat: true`**，與後端擋聊天一致。  
   - **`POST .../worker-step-result` 成功後**：若該 run 仍綁定 `agentId` 與 `chat_room_id`，對該 agent 呼叫 **`heartbeat.wakeup`**（`source: automation`、`taskKey: chat:{roomId}`、`idempotencyKey: workflow:continue:{runId}:{updatedAt}`；若 run 已終止則附 **`paperclipWorkflowTerminalReportDue`** 與 `workflow:terminal:...`），以銜接同一 chat session 的下一輪 heartbeat，減少每步冷啟。  
   - **鏈式 heartbeat**：同一 run 內 `adapter.execute` 成功後，對 DB **短暫輪詢**（約 2s 內）再讀 `pending_worker` 鍵，避免 `worker-step-result` 寫入延遲導致誤判「同一步卡住」而提前結束鏈。  
   - **聊天硬性規則**：Agent 對已綁定之聊天室 **`POST .../messages`** 時，若存在與該 `chat_room_id` + `agent_id` 對應且狀態**非** `completed`／`failed`／`cancelled` 之 workflow run，回 **409**（除錯：`X-Paperclip-Workflow-Chat-Override: 1` 且 board `local_implicit`，或 `WORKFLOW_CHAT_AGENT_OVERRIDE=1` 時 agent）。終止後允許發言；提示詞要求 **POST 一則**使用者可讀總結。  
   - **實際多步迴圈**仍以 adapter／CLI 依提示呼叫 API 為準；server 不代替執行工具。

5. **Deny 語意**  
   - **不**終止 run；寫入 reason（若有）並回到 **`waiting_worker`** 重試同一步。  
   - **Cancel** 終止 run（與既有 cancel 一致）。

## 後果

- Board／`WorkflowRunPanel` 需支援核准三態與 worker 等待說明；i18n 同步。  
- 遷移檔需 `pending_approval`、`pending_worker`、`chat_room_id`。  
- 既有 checkpoint「自動核准」行為仍由 `require_human_confirm` 控制；與 **執行前核准**（`require_approval_before`）為不同維度。
