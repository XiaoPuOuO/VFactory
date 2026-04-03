# BYOK 收費維度與 List／Overage（內部規格）

本檔為 **BYOK 優先** 商業模式之定價維度試算基礎；金額為 **示意**，正式售價以財務／銷售定稿為準。

## 1. 計費軸（與模型 token 分離）

| 維度 | 說明 | List（含括）策略 | Overage 策略 |
|------|------|------------------|--------------|
| 公司訂閱底座 | 每 company 月費 | 依方案（Free／Team／Business／Enterprise） | 多公司加購 |
| 編輯席 | 可改 Agent／Workflow／設定 | 方案內含 K 席 | 超席 $／席／月 |
| 計費執行 | 平台編排之 Run／Heartbeat／Workflow 觸發 | 每月 M 次（成功計價為主） | 階梯單價或預購包 |
| 並發 | 同時執行數 | 方案內含 N | 加購並發包 |
| 儲存 | 附件／log／memories GB-月 | 含括 GB | $／GB-月 |
| Webhook 派送 | 成功派送次／月 | 含括量 | 事件包 |
| Integration tokens | API 金鑰數 | 含括 | 每把 $／月 |
| 審計保留 | 活動／稽核天數 | 分級 | 升級月費 |
| 託管推論（選配） | 官方 Key + markup | 點數包 | 預付 + 硬上限 |

## 2. 示意 List（占位數字，供試算表複製）

| 方案 | 底座 USD／月（示意） | 編輯席含括 | 計費執行／月 | 並發 |
|------|----------------------|------------|--------------|------|
| Free | 0 | 2 | 500 | 1 |
| Team | 49 | 10 | 20,000 | 3 |
| Business | 199 | 40 | 100,000 | 10 |
| Enterprise | 議價（ACV 下限） | 議價 | 議價 | 議價 |

TWD 定價可依匯率與綠界通路另列一欄。

## 3. Overage 示意（占位）

- 計費執行：超出後每 1,000 次一階（例如 $2 → $1.5 → $1）。  
- 超席：Team 示意 $12／編輯席／月。  
- Webhook：超出每 10 萬次 $15（示意）。

## 4. 相關文件

- [byok-tier-matrix.md](./byok-tier-matrix.md)  
- [byok-addons-catalog.md](./byok-addons-catalog.md)  
- [byok-billing-engine-backlog.md](./byok-billing-engine-backlog.md)
