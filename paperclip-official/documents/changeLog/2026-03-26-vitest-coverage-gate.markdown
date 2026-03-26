# 2026-03-26 Vitest Coverage Gate（80%）

## 變更內容

- 補上缺失依賴 **`@vitest/coverage-v8`**，使 `vitest --coverage` 可正常執行。
- 在 `vitest.config.ts` 新增 coverage 設定：
  - `provider: "v8"`
  - `reporter: ["text", "text-summary", "html"]`
  - `thresholds`：`lines/functions/branches/statements` 全部設為 **80**。
- 在 `package.json` 新增腳本 **`test:coverage`**（`vitest run --coverage`），作為 QA/CI 可重用的覆蓋率 gate 指令。

## 驗收說明

- 目的：讓 ECC 的「覆蓋率至少 80%」要求可被自動化驗證，而非僅以測試全綠判定。
- 使用方式：在 monorepo 根目錄執行 `pnpm test:coverage`，若任一 coverage 指標低於 80%，流程會失敗。
