# AI Company 落地計畫 — 開放問題（Q1–Q10）與預設決策

以下為部署前需與營運／資安確認的項目；未決前可採「預設」欄位實作，並在變更時更新 CHANGE MAP（對應程式：`service-logs`、`platform-alerts`、`deploy-with-rollback.sh`）。

| ID | 問題 | 預設（可替換） |
|----|------|----------------|
| Q1 | Production log 後端 | 應用內 `application_log_entries` + `GET/POST .../service-logs`；進階可改為 Loki proxy。 |
| Q2 | 部署目標 | 單機 artifact + `scripts/deploy-with-rollback.sh` symlink；K8s／Railway 則改用平台 revision rollback。 |
| Q3 | Staging 同形 | CI 僅驗證 build；staging 部署 job 待環境就緒後再加。 |
| Q4 | Metrics 長期存放 | 先 scrape `GET /metrics`；remote_write 由監控棧決定。 |
| Q5 | 告警入口 | `POST /api/webhooks/platform-alerts` + `X-Paperclip-Alert-Token`；Alertmanager 可轉發此格式。 |
| Q6 | 零停機 | symlink 切換為瞬時；rolling 由 orchestrator 負責。 |
| Q7 | CEO／Roadmap LLM | 沿用現有 LLM 路由；Roadmap 版本僅存 Markdown。 |
| Q8 | Diagnostician 開 PR | 預設僅建議 + Issue 留言；見 `documents/runbooks/diagnostician-alert-issue.md`。 |
| Q9 | human_override 與 Issue approval | 分開：override 為 roadmap 表；Issue 審批沿用 `issue_approvals`。 |
| Q10 | 合規／保留 | `service-logs` 寫入應避免 PII；保留天數由 DB 清理 job 或環境策略決定。 |

## 環境變數速查

| 變數 | 用途 |
|------|------|
| `PAPERCLIP_ALERT_WEBHOOK_SECRET` | 平台告警 webhook 驗簽 |
| `PAPERCLIP_METRICS_ENABLED` | 啟用 `/metrics` |
| `PAPERCLIP_METRICS_SCRAPE_TOKEN` | 選用：metrics 的 Bearer |
| `PAPERCLIP_WATCHDOG_ESCALATION_ISSUES` | 設為 `true` 時，reap orphan runs 後為每公司建立 escalation Issue |
