# Heartbeat 輸入 Token：計費口徑、Log 欄位與優化開關

本文件對應「Heartbeat 輸入 Token 成本」工作計劃階段 0–1，供 Tech Lead、後端與成本分析對齊。

## 1. 計費與指標口徑

### 1.1 Adapter 回報的 usage 欄位（camelCase 為主）

| 欄位 | 意義（概念） | 備註 |
|------|----------------|------|
| `inputTokens` | 供應商計入「非快取／新輸入」的 token | 部分供應商與 `prompt_tokens` 對應 |
| `outputTokens` | 產出 token | 可能對應 `completion_tokens` |
| `cachedInputTokens` | 部分供應商用於「快取讀取」的折價輸入 | 與 `cacheReadTokens` 可能重疊或擇一 |
| `cacheReadTokens` | Cursor 等串流 JSON 常見欄位（快取讀） | 見 `cursor-local` `parse.ts` 聚合 |
| `cacheWriteTokens` | 快取寫入 | 建立 prompt cache 區塊時 |

**內部成本對照**：以 `costService.createEvent` 寫入之 `inputTokens`、`cachedReadTokens` 等為準；UI／Run log 標頭之 `input=` / `cacheRead=` 應與同一 run 之 `usageJson` 一致（允許 adapter 僅填部分欄位）。

### 1.2 為何「input 仍高但 cacheRead 也很大」

快取命中時，供應商可能同時回報「新輸入區塊」與「快取讀取區塊」token。長對話第二輪起，**工具回傳全文**（例如編輯檔案之前後全文）會成為新的可計費輸入，與 prompt 前綴快取並存。

## 2. 環境變數（伺服器）

| 變數 | 預設 | 說明 |
|------|------|------|
| `HEARTBEAT_COMPANY_PROJECTS_LIST_MODE` | `full` | `full`：維持 `id/name/description`。`summary`：僅 `id/name`，降低 context 與 `PAPERCLIP_COMPANY_PROJECTS_JSON` 體積。 |
| `HEARTBEAT_COMPANY_SKILLS_CACHE_TTL_MS` | `10000` | 公司技能 bundle 解析結果記憶體快取 TTL（毫秒）；上限 1h。invalidation 仍由 bundle 寫入時 `invalidateCompanySkillBundleCache` 負責。 |
| `HEARTBEAT_LOG_PROMPT_BUILD_DIGEST` | （未設） | 設為 `1`/`true` 時，於 run 的 stderr 記錄技能注入字元數等 digest（不含全文）。 |
| `HEARTBEAT_WORKFLOW_CONTINUATION_MINIMAL` | （未設） | 設為 `1`/`true` 時，workflow worker 延續提示改為較短版本（仍保留 run id、步驟與 API 路徑）。 |

## 3. 技能：`metadata.passiveWakeHints`（被動技能按需注入）

- 若 **未設定**或 **空陣列**：被動技能行為與以往相同（仍受總字元上限約 16k 約束）。
- 若 **設定為非空字串陣列**：僅當 wake 上下文字串（`wakeReason`、`wakeReasonLabel`、`wakeSource` 等彙整）**不分大小寫**包含任一字串時，才注入該被動技能。

## 4. AGENTS 路徑快取

`applyHeartbeatInstructionFallback` 對 workspace 向上尋找 `AGENTS.md` 的結果會以 **工作目錄路徑 + 檔案 mtime** 做程序內快取，減少重複 `fs.stat` 巡迴（不影響首次解析結果）。

## 5. Timer 空轉

`tickTimers` 在 **無未完成指派 issue 且無可用 Goal** 時已 **不 enqueue**，僅更新 `lastHeartbeatAt` 並計入 `skippedNoWork`（見 `heartbeat.ts` timer 迴圈）。

## 6. Baseline 分析腳本

見 `paperclip-official/scripts/analyze-heartbeat-run-log.mjs`：離線解析 VFactory run log 標頭與可選之第一則 user 訊息長度，供抽樣對照。
