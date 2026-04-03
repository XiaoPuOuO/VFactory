# 加購 SKU 目錄（官網／帳單／銷售）

## 核心加購

| SKU | 說明 | 計費 | 建議掛載頁面 |
|-----|------|------|----------------|
| 編輯席包（5／25／100） | 超含括席次 | 月／年 | Company billing、Checkout |
| 執行量包 | +N 萬次計費執行／月 | 月／年 | Billing、用量頁 |
| 並發提升 | +N 同時 Run | 月費 | Billing |
| SSO | SAML／OIDC | 月費或 Business+ | 定價比較表 |
| SCIM | 自動佈建 | Enterprise 或加購 | 企業報價單 |
| 審計保留升級 | 30→90→180→365 天 | 月費階梯 | 合規說明 |
| 託管推論額度 | 官方 Key／點數 | 預付 + markup | [byok-hosted-inference-addon.md](./byok-hosted-inference-addon.md) |
| 優先支援 | 4h／8h 回應 | 年費 | Enterprise |
| 專業服務 | 上線 2 週、遷移 | 人天包 | 銷售 |

## 組合包（提升客單）

- **自動化包**：Webhook 量 + Integration token 額度 + API RPM。  
- **資料與合規包**：審計保留 + 匯出額度 + memories 容量。  
- **執行包**：並發 + 執行點數 + 瀏覽器類 Run 折扣。  
- **平台費（Platform fee）**：年約固定費，利於 IT 採購科目。

## 展示原則

- Team 客戶在 **Billing** 顯示「建議下一步加購」三項（由方案與用量驅動，後續產品化）。  
- 官網 **定價** 區塊必列「模型費另计／BYOK」與「我們收什麼」連結 [billing-saas.md](./billing-saas.md)。
