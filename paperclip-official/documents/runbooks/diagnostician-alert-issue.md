# Diagnostician：由告警／Watchdog Issue 觸發的診斷流程

當 Issue 來自 `POST /api/webhooks/platform-alerts`（`executionLabel` 為 `alert:*`）或由 Watchdog 建立（`watchdog:reap:*`）時，建議以**唯讀**方式蒐集證據再決定是否升級或指派代理人。

## 建議步驟

1. **確認範圍**：記錄 `companyId`、Issue 標題中的 `[alert]`／`[Watchdog]` 前綴與描述中的 `severity`／run id 清單。
2. **指標**：若可存取受保護的 `GET /metrics`（需 `PAPERCLIP_METRICS_ENABLED` 與選用的 `PAPERCLIP_METRICS_SCRAPE_TOKEN`），檢查：
   - `paperclip_http_5xx_total`
   - `paperclip_schedule_tick_errors_total`
   - `paperclip_heartbeat_timer_errors_total`
   - `paperclip_heartbeat_run_failures_total`
3. **服務日誌**：具權限時使用 `GET /api/companies/:companyId/service-logs`（依現行 RBAC）依時間與 level 篩選。
4. **活動稽核**：在 UI 或 API 查詢 `activity` 中與同一時間窗相關的 `issue.created_from_alert`、`roadmap.*` 等事件。
5. **結論**：在 Issue 留言中寫明根因假設、已排除項目、建議後續（例如調整排程、重啟程序、修正設定）；**不**自動開 PR，除非另有治理流程授權 Git 寫入。

## Workflow 範本（概念）

- **觸發**：Issue 標籤或標題符合 `alert`／`watchdog`。
- **步驟**：`invoke_workflow` 或 `prompt` 步驟標記 `dangerous: true` 時仍須人工核准（見 workflow-run-service 對 `dangerous` 的 gate）。

此文件與 `server/src/lib/planning-priority.ts` 的優先序（human_override > alert_driven > …）併用時，應以人為覆寫與審批為準。
