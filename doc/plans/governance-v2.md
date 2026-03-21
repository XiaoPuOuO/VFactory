# Governance V2：多 Board 成員與委任授權

狀態：實作中  
日期：2026-03-21  
對齊：`documents/backup.md`、本 repo 實作

## 1. 目標

在 **公司（company）範圍**內支援多位人類操作者（Board 成員）之可解釋角色與權限，並支援 **依政策自動核准**（例如小額 `hire_agent`），且稽核可區分 **人工決策** 與 **政策自動決策**。

## 2. 驗收準則

| 區塊 | 驗收 |
|------|------|
| 公司成員角色 | `company_memberships.membership_role` 使用固定枚舉；非 owner 成員可依 `principal_permission_grants` 與角色預設被拒絕於未授權之 API |
| 權限鍵 | `PERMISSION_KEYS` 含 `approvals:resolve`、`governance:policies:manage`；高風險路由使用 `assertCompanyPermission`（`local_implicit` 仍略過） |
| 委任政策 | 公司可設定啟用之 `hire_agent` 政策（例如 `maxBudgetMonthlyCents`）；符合時自動完成核准並啟用 agent |
| 稽核 | `approvals` 含 `decision_source`（human / policy）；政策自動核准寫入 activity；UI 可辨識來源 |

## 3. 非目標（本里程碑）

- 跨租戶委派或外部 IdP 進階角色對應
- 非 `hire_agent` 之全類型自動核准（可後續擴充 `approval_type`）

## 4. 相關檔案

- Schema：`packages/db/src/schema/company_memberships.ts`、`approvals.ts`、`company_approval_policies.ts`（或同等表名）
- 服務：`server/src/services/access.ts`、`server/src/services/approvals.ts`、治理政策服務
- 路由：`server/src/routes/access.ts`、`server/src/routes/agents.ts`、`server/src/routes/approvals.ts`
- UI：`ui/src/pages/Governance.tsx`、Approvals 相關頁面
