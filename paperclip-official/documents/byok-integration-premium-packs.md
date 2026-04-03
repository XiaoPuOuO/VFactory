# 整合類加購包（Webhook／API／Browser）

## 自動化包（建議 SKU：`addon_automation_starter`）

| 內含 | 示意配額 |
|------|----------|
| Webhook 成功派送／月 | +100,000 |
| Integration tokens | +3 |
| 控制面 API（日請求） | +50,000 |

## 自動化包 Pro（`addon_automation_pro`）

- 派送／月 +500k、tokens +10、API 日請求 +200k（示意）。

## Browser／長執行包（`addon_browser_minutes`）

- 按 **佔用分鐘** 或 **次數** 預付；與 BYOK LLM 分開計價。  
- 對應產品：browser-use 連接器、長 timeout 執行。

## 定價展示

- 官網：與「模型費用自付」並列說明。  
- 帳單頁：以「加購」區塊列出，Checkout 走既有 Stripe／綠界擴充 SKU（見 [byok-billing-engine-backlog.md](./byok-billing-engine-backlog.md)）。
