# 方案分級矩陣（Free／Team／Business／Enterprise）

對應資料庫：`plans.slug` 目前可為 `free`、`pro`（產品對外名稱 **Team** 建議與 `pro` 對齊）；`business`／`enterprise` 可於 Stripe／綠界價格就緒後 **INSERT** 新列並設 `active`。

## 功能與限額矩陣（摘要）

| 能力 | Free | Team | Business | Enterprise |
|------|------|------|----------|-------------|
| BYOK | 必填 | 預設 | 預設 | 預設 |
| 託管推論 | 可選加購 | 可選加購 | 可選加購 | 合約 |
| SSO／SCIM | 無 | 無／加購 | SSO | SSO + SCIM |
| 審批／治理進階 | 基礎 | 標準 | 多階／政策 | 客製 |
| 審計保留 | 短（例：30d） | 90d | 180d | 365d+ |
| Run quality 進階 | 無 | 加購 | 含 | 含 + API |
| 白牌／專屬实例 | 無 | 無 | 無 | 有 |

## `plans.entitlements` 建議鍵（JSON）

與 [`packages/db/src/schema/plans.ts`](../packages/db/src/schema/plans.ts) 型別一致擴充：

- `tokenLimit`／`priceLimitCents`：團隊 **預算護欄**（BYOK 下仍建議保留，對齊 costService）。  
- `tierKey`：`free` | `team` | `business` | `enterprise`（展示用）。  
- `billableRunsPerMonth`：平台計費執行含括（**尚未全面強制執行前**可作展示與未來 meter）。  
- `editorSeatsIncluded`：含括編輯席。  
- `concurrentRuns`：並發上限。  
- `webhookDeliveriesPerMonth`：Webhook 成功派送含括（示意）。

## 與 `expandable-feature-billing-matrix` 的關係

細項功能（Plugin、memories、Chat 房間數等）見 [byok-feature-billing-matrix.md](./byok-feature-billing-matrix.md)。
