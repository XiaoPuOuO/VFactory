# BYOK 計責邊界與 GTM 摘要（對內／對外）

本文件彙整計責邊界、對外訊息與加購條款入口；細部定價與矩陣見同目錄專題文件。

## 1. 誰付什麼錢（計責邊界）

| 項目 | 付款對象 | 說明 |
|------|----------|------|
| LLM／雲端推論 token 與供應商帳單 | **客戶 → 模型原廠** | 預設 **BYOK**：API Key 由客戶提供，費用出現在客戶的 Anthropic／OpenAI／Google 等帳單。 |
| VFactory 訂閱與平台配額 | **客戶 → VFactory** | 控制台、治理、協作、**平台執行／儲存／出站** 等配額與加購。 |
| 託管推論（選配） | **客戶 → VFactory** | 官方代管 Key 與用量時，模型成本 **轉嫁 + 明碼 markup** 或點數制；與 BYOK 分開列示。見 [byok-hosted-inference-addon.md](./byok-hosted-inference-addon.md)。 |

對外一句話：**「模型費用歸您與原廠；我們對平台與治理收費。」**

## 2. 對外 GTM 要點

- **首屏**：BYOK 預設 + 三賣點（控制平面、治理、成本可視／護欄）。  
- **定價透明**：底座 + 平台配額 + 加購；託管推論為選配。  
- **Land & Expand**：試用 → Team → 用量／席次加購 → Business／Enterprise。詳見 [byok-gtm-land-expand.md](./byok-gtm-land-expand.md)。

## 3. 加購與條款入口

- SKU 與組合包：[byok-addons-catalog.md](./byok-addons-catalog.md)  
- 整合類（Webhook、Token、API）：[byok-integration-premium-packs.md](./byok-integration-premium-packs.md)  
- 功能 × 方案閘門：[byok-feature-billing-matrix.md](./byok-feature-billing-matrix.md)  
- 計費引擎擴充：[byok-billing-engine-backlog.md](./byok-billing-engine-backlog.md)

## 4. 對內 vs 對外

| 內容 | 對外 | 對內 |
|------|------|------|
| 計責邊界 | 官網／Landing／FAQ／帳單頁註記 | 本節 + billing-saas 索引 |
| 示意配額數字 | 與產品顯示一致即可 | [byok-revenue-model-spec.md](./byok-revenue-model-spec.md)、[byok-tier-matrix.md](./byok-tier-matrix.md) 試算與校準 |
| 託管 markup% | 「透明加價」原則，不公開公式細節亦可 | 財務與風控核准之 markup／上限／預付規則 |

## 5. 與 `billing-saas.md` 的關係

實作與 API 行為以 [billing-saas.md](./billing-saas.md) 為準；BYOK 商業與文件索引見該檔「BYOK 文件索引」一節。
