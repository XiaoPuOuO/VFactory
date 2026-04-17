# SaaS 方案與計費（Billing）

## 概覽

- **BYOK（Bring Your Own Key）**：預設由客戶自備 LLM／雲端供應商 API Key；**模型費用付給原廠**。VFactory 對 **平台、治理、協作與配額** 收費（訂閱 + 可選用量／加購）。詳見 [byok-revenue-model-spec.md](./byok-revenue-model-spec.md)、[byok-tier-matrix.md](./byok-tier-matrix.md)、[byok-addons-catalog.md](./byok-addons-catalog.md)。
- 每個 **company** 至多一筆訂閱（`company_subscriptions`），方案目錄為 `plans`（含 `free` / `pro` 等 slug）。
- `company_subscriptions.payment_provider` 可為 `stripe`、`ecpay` 或 **`manual`**（此站管理員於「公司管理」手動指定方案，不經金流）。`current_period_end` 為 **null** 表示手動方案**永久有效**；若為時間戳且已過期，則 `resolveCompanyEffectiveLimits` 將該公司**不再視為**擁有該付費方案，回落 `free`（Stripe／綠界訂閱不因單一欄位過期而在此截斷）。
- 有效用量上限由 `resolveCompanyEffectiveLimits` 計算：`companies.tokenLimit` / `priceLimitCents` 非 null 時**覆寫**方案，否則繼承訂閱中方案（無訂閱則 `free`）。`costService` 僅依有效值判斷是否超限。
- 金流與統一發票透過 **Port**（`PaymentProvider`、`InvoiceIssuanceProvider`）與 **Adapter**（Stripe、綠界、綠界發票／Noop）實作；核心與 routes 不依賴第三方 SDK 型別。

## HTTP API（需登入 board 上下文）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/plans` | 作用中方案列表 |
| GET | `/api/companies/:companyId/billing` | 公司帳單狀態與有效上限 |
| POST | `/api/companies/:companyId/billing/checkout` | 建立結帳（Stripe 回傳 URL；綠界回傳表單欄位） |
| POST | `/api/companies/:companyId/billing/switch-plan` | Body：`{ planSlug }`。不經金流，直接將該公司訂閱寫成 `payment_provider=manual`、`status=active`、`current_period_end=null`（公司帳單頁一鍵切換；會覆寫既有訂閱列含外部客戶 id，正式上線若僅允許結帳可移除此端點或改旗標關閉）。 |
| POST | `/api/companies/:companyId/billing/portal` | Stripe Customer Portal URL（僅 Stripe 訂閱） |

**此站設定（需 `admin.setting`）— 手動方案**

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/instance/settings/plan-assign-options` | 啟用中方案之 `id` / `slug` / `name`（供公司管理下拉選單） |
| PATCH | `/api/companies/:companyId/manual-subscription` | Body：`{ planId, currentPeriodEnd }`；`currentPeriodEnd` 為 ISO 字串或 **null**（永久）。寫入 `payment_provider=manual`、`status=active`。若該公司已有非 `manual` 之訂閱列（Stripe／綠界），回 **409** `BILLING_SUBSCRIPTION_CONFLICT`，避免覆寫外部客戶／訂閱 id。 |

`GET /api/companies/stats` 回傳之每家公司物件含 `subscription`（與訂閱列 join 方案後之摘要），供公司管理列表顯示方案／期限。

具副作用的 POST 需 **CSRF**（與其他 board API 相同）。

## Webhook（不使用 session CSRF）

| 方法 | 路徑 | 驗證 |
|------|------|------|
| POST | `/api/webhooks/billing/stripe` | Stripe 簽章（raw body） |
| POST | `/api/webhooks/billing/ecpay` | 綠界 CheckMacValue（`application/x-www-form-urlencoded`） |

Webhook 事件以 `billing_webhook_events` 做**冪等**（依 provider + 外部 event id）。

## 環境變數

| 變數 | 用途 |
|------|------|
| `PAPERCLIP_PUBLIC_URL` | 對外站臺 URL（**必填**才可結帳；用於 success/cancel 與 Webhook 相關絕對路徑） |
| `PAPERCLIP_DEFAULT_PAYMENT_PROVIDER` | `stripe` \| `ecpay`（預設 stripe） |
| `PAPERCLIP_DEFAULT_INVOICE_PROVIDER` | `ecpay` \| `noop`（預設 noop） |
| `STRIPE_SECRET_KEY` | Stripe 後端密钥 |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook signing secret |
| `PAPERCLIP_STRIPE_PRICE_PRO_USD` 等 | 各方案對應之 Stripe Price ID（依 `plans.externalIds` 與 factory 對照） |
| `PAPERCLIP_ECPAY_MERCHANT_ID` | 綠界商店代號 |
| `PAPERCLIP_ECPAY_HASH_KEY` / `PAPERCLIP_ECPAY_HASH_IV` | 綠界 HashKey / HashIV |
| `PAPERCLIP_ECPAY_PAYMENT_URL` | 綠界付款閘道 URL（沙箱／正式） |
| `PAPERCLIP_ECPAY_NOTIFY_URL` | 綠界 NotifyURL（須對外可達） |

發票相關綠界參數見 `server/src/billing/factory.ts` 與 `ecpay-invoice-adapter`（未完整設定時可為 noop／略過）。

## 資料庫

Migration：`packages/db/migrations` 內含 `plans`、`company_subscriptions`、`billing_webhook_events`、`billing_invoice_attempts` 等。部署後請執行 `pnpm db:migrate`（或專案慣用之 migrate 指令）。

## 前端

- 路由（company prefix 下）：`/company/billing`、`/company/billing/return`、`/company/billing/cancel`、`/pricing`。
- i18n：`billing` namespace 與 `nav.billing`。
- 授權／定價參考頁：將常見 `plans.slug`（如 `free`、`pro`、`team`、`enterprise`、`self_hosted` 等）映射為對外層級文案（Community／Business／Enterprise／Self-hosted Enterprise）；未列於映射表的 slug 仍顯示資料庫 `name`／`description`。實作：`ui/src/lib/planLicenseTier.ts`。
- 落地頁 BYOK／定價透明說明：`Landing` 與 [byok-gtm-land-expand.md](./byok-gtm-land-expand.md)。

## BYOK 文件索引

| 文件 | 用途 |
|------|------|
| [byok-revenue-model-spec.md](./byok-revenue-model-spec.md) | 收費維度與 List／Overage 示意 |
| [byok-tier-matrix.md](./byok-tier-matrix.md) | 四階方案與 entitlements 鍵 |
| [byok-addons-catalog.md](./byok-addons-catalog.md) | 加購 SKU 與組合包 |
| [byok-gtm-land-expand.md](./byok-gtm-land-expand.md) | 銷售劇本與話術 |
| [byok-billing-engine-backlog.md](./byok-billing-engine-backlog.md) | 計費引擎擴充 backlog |
| [byok-feature-billing-matrix.md](./byok-feature-billing-matrix.md) | 功能 × 方案閘門 |
| [byok-integration-premium-packs.md](./byok-integration-premium-packs.md) | 整合類加購包 |
| [byok-hosted-inference-addon.md](./byok-hosted-inference-addon.md) | 託管推論選配 |
| [byok-charge-boundary-and-gtm.md](./byok-charge-boundary-and-gtm.md) | 計責邊界與 GTM 摘要（對內／對外） |
