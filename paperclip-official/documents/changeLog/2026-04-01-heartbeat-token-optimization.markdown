# ChangeLog: Heartbeat 輸入 Token 成本（量測開關與裁剪）

## 摘要

- 新增技術說明 [`documents/heartbeat-token-cost-optimization.md`](../heartbeat-token-cost-optimization.md)（計費欄位、環境變數、timer 既有行為）。
- 被動技能支援 `metadata.passiveWakeHints`（按需注入）；公司技能 bundle 快取 TTL 可調 `HEARTBEAT_COMPANY_SKILLS_CACHE_TTL_MS`。
- 專案列表可 `HEARTBEAT_COMPANY_PROJECTS_LIST_MODE=summary` 略過 description。
- AGENTS fallback 路徑解析加入 mtime 快取；workflow 延續提示可 `HEARTBEAT_WORKFLOW_CONTINUATION_MINIMAL=1` 縮短；`context` 注入 `paperclipHeartbeatChainIndex`。
- 離線分析腳本：`scripts/analyze-heartbeat-run-log.mjs`。

## API／Schema

- `SkillMetadata.passiveWakeHints?: string[]`（shared 套件 Zod 已驗證）。
