# Billing 引擎擴充 Backlog（用量與加購）

現況：`plans`／`company_subscriptions`、Stripe／綠界結帳、Webhook 冪等、**costService** 與 **tokenLimit／priceLimitCents** 已存在。BYOK 深化需以下 **可選實作**（按優先序）。

## P0：可觀測性

- [ ] **用量儀表**：公司級「本月計費執行已用／含括／預估超標」（資料源：cost events、workflow_runs、heartbeat 等需統一定義「Billable run」）。  
- [ ] 對客 **計費執行定義** 文件與錯誤頁連結。

## P1：Meter 與帳單行項目

- [ ] DB：`usage_meters` 或每月 rollup 表（company_id, period, metric, quantity）。  
- [ ] `billing_facade`：月結／Stripe usage record／綠界週期對帳（擇一）。  
- [ ] Invoice line items：區分「訂閱」「用量」「加購」。

## P2：Entitlements 強制

- [ ] 中台攔截：超 **並發**、超 **webhook**、超 **token 護欄** 時行為（排隊／拒絕／軟提示）。  
- [ ] Feature flags：SSO、Plugin 進階與方案綁定。

## P3：加購 Checkout

- [ ] Stripe Price 一對一 SKU；或單一「加購購物車」session。  
- [ ] 綠界：週期或單筆品項對應表。

## 關聯程式

- [`server/src/billing/facade.ts`](../server/src/billing/facade.ts)  
- [`server/src/services/costs.ts`](../server/src/services/costs.ts)  
- [`documents/billing-saas.md`](./billing-saas.md)
