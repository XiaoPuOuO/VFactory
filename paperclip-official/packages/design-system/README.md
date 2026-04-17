# @paperclipai/design-system

Vanilla CSS 設計權杖與元件樣式（oklch 色彩、Inter variable、Radix／`data-slot` 契約）。不含 React；應用程式可搭配任意框架，只要 DOM 結構與 `data-slot`／`data-variant` 與本套件選擇器一致。

## 安裝

```bash
npm install @paperclipai/design-system
# 或
pnpm add @paperclipai/design-system
```

## 使用

在應用程式主樣式入口：

```css
@import "@paperclipai/design-system";
```

僅權杖或 base：

```css
@import "@paperclipai/design-system/tokens";
@import "@paperclipai/design-system/base";
```

## 深色模式

在根元素加上 class `dark`（與本 repo `ThemeContext` 一致）。首屏可搭配獨立 `theme-init.js` 讀取 `localStorage` 避免 FOUC。

## DOM 契約（節選）

| 屬性 | 說明 |
|------|------|
| `[data-slot="button"]` | 按鈕；`data-variant`、`data-size` |
| `[data-slot="input"]` | 文字輸入 |
| `[data-slot="inline-alert"]` | 行內提示；`data-variant`: success / warning / error / info |
| `[data-slot="switch"]` | `role="switch"` + `[data-slot="switch-thumb"]` |
| `.ds-container`、`.ds-stack`、`.ds-grid`、`.ds-split` | 版面 primitive |
| `.ds-table-wrap`、`.ds-table` | 資料表容器與表格 |
| `.ds-field` | 表單欄位群組；`data-invalid="true"` 觸發錯誤樣式 |
| `.ds-search` | 搜尋列（內含 `input`） |

完整清單見套件內 `src/index.css` 匯入順序與各 `components/*.css`。

## 語意化版本

遵循 SemVer；權杖或選擇器變更可能為 **minor**（新增）或 **major**（破壞契約）。升級前請對照 Design Guide 或消費端視覺回歸。

## 授權

MIT（與 monorepo 根目錄一致）。
