# 2026-03-25 Vite：強制單一 React 副本（Invalid hook call）

## 問題

開發模式由 server 內嵌 Vite（`middlewareMode`）提供 UI 時，瀏覽器可能出現 `Invalid hook call`、`resolveDispatcher() is null`，堆疊指向 `ThemeProvider` / `useState`。常見原因為 **同一頁載入多份 `react` 實體**（預打包與原始碼解析路徑不一致）。

## 變更

- `ui/vite.config.ts`：為 `react`、`react-dom`、`react/jsx-runtime`、`react/jsx-dev-runtime` 設定 **alias** 指向 `ui/node_modules` 內單一路徑；擴充 `dedupe` 與 `optimizeDeps.include`。

## 若仍異常

刪除 Vite 快取後重啟 dev server：

```bash
rm -rf ui/node_modules/.vite
```
