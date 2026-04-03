# SaaS 方案與計費（Billing）

## 概覽

- **BYOK（Bring Your Own Key）**：預設由客戶自備 LLM／雲端供應商 API Key；**模型費用付給原廠**。VFactory 對 **平台、治理、協作與配額** 收費（訂閱 + 可選用量／加購）。詳見 [byok-revenue-model-spec.md](./byok-revenue-model-spec.md)、[byok-tier-matrix.md](./byok-tier-matrix.md)、[byok-addons-catalog.md](./byok-addons-catalog.md)。
- 每個 **company** 至多一筆訂閱（`company_subscriptions`），方案目錄為 `plans`（含 `free` / `pro` 等 slug）。
- 有效用量上限由 `resolveCompanyEffectiveLimits` 計算：`companies.tokenLimit` / `priceLimitCents` 非 null 時**覆寫**方案，否則繼承訂閱中方案（無訂閱則 `free`）。`costService` 僅依有效值判斷是否超限。
- 金流與統一發票透過 **Port**（`PaymentProvider`、`InvoiceIssuanceProvider`）與 **Adapter**（Stripe、綠界、綠界發票／Noop）實作；核心與 routes 不依賴第三方 SDK 型別。

## HTTP API（需登入 board 上下文）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/plans` | 作用中方案列表 |
| GET | `/api/companies/:companyId/billing` | 公司帳單狀態與有效上限 |
| POST | `/api/companies/:companyId/billing/checkout` | 建立結帳（Stripe 回傳 URL；綠界回傳表單欄位） |
| POST | `/api/companies/:companyId/billing/portal` | Stripe Customer Portal URL（僅 Stripe 訂閱） |

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
