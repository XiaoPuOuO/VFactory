# 消費級 UI 驗收檢查清單

於 release 或大型樣式合併前執行；與 [`ui-commercial-upgrade-inventory.md`](./ui-commercial-upgrade-inventory.md) 搭配使用。

## 禁止清單（必查）

- [ ] 圖示與相鄰文字無重疊、垂直對齊一致（尤其按鈕、列表列、麵包屑）。
- [ ] 表單輸入在 flex／grid 內有 `min-width: 0` 或等效，不與鄰近元素重疊或撑破版面。
- [ ] 主要內容區無非預期的水平捲動（寬表僅在意圖的 `.ds-table-wrap`／`overflow-x: auto` 內捲動）。
- [ ] 觸控裝置：主要 CTA 與底欄項目可點區域足夠（底欄已加 `.ds-touch-target` 輔助）。
- [ ] 文字與背景對比足夠（淺色／深色主題各抽樣 primary、muted、destructive）。
- [ ] `:focus-visible` 可見且不被 `outline: none` 吃掉（鍵盤 Tab 走訪導覽、表單、對話框）。
- [ ] 動畫不造成眩暈；系統開啟「減少動態效果」時無長時間 shimmer／過大位移（見 design-system `prefers-reduced-motion`）。
- [ ] 窄螢（≤744px）：導覽與主要 CTA 仍在可視範圍內可達（底欄、抽屜、無公司工具列 z-index 與 [`tokens.css`](../packages/design-system/src/tokens.css) 一致）。

## 斷點與壓力情境

- [ ] **744px（`--breakpoint-md`）**：board 主內距、底欄隱藏、麵包屑 padding 切換正確。
- [ ] **1280px／寬螢**：`--layout-container-max` 內容不過度拉伸時仍可讀。
- [ ] **長表格**：Instance 用戶／公司列表等橫向捲動僅發生在卡片內。
- [ ] **長表單**：Instance 設定、Agent 設定可捲動且 sticky 區域（若有）不遮擋提交。

## 無障礙抽查

- [ ] 對話框開啟時焦點陷阱與 Esc 關閉（Radix 預設行為未退化）。
- [ ] 閘道 loading／error 具 `role="status"` 或 `role="alert"`（已於 `App.tsx` 部分頁面套用）。

## 截圖／錄影建議（手動或 Playwright）

| 斷點寬度 | 建議頁面 |
|----------|-----------|
| 390 | Landing、Auth、`:prefix`/issues、chat |
| 744 | 同上 + instance settings |
| 1280 | Dashboard、Design Guide、Issue detail |

將產出附於 PR 或內部驗收資料夾，並在 PR 描述附上「變更頁面清單」連結至 inventory 文件。
