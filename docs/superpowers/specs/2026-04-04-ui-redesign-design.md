# Paperclip UI 全面重設計規格

**日期：** 2026-04-04
**狀態：** 已確認，待實作
**範圍：** 全專案 UI（51 頁面、93+ 元件）

---

## 1. 設計目標與原則

### 核心策略：漸進式揭露（Progressive Disclosure）

表層友善溫暖（B 類用戶），深層專業強大（A 類用戶）。

- **表層（大部分用戶）**：友善的 UX 特效、豐富的操作回饋、簡潔的預設導覽、引導式空狀態。讓不懂技術的用戶也能輕鬆上手。
- **背後（工程師用戶）**：所有進階功能（複雜的 Agent 配置、Governance、Costs、Workflow 編輯器）保持完整可達，不被簡化掉。

### 品質目標

- 可對外販售的產品感：有品牌溫度與情緒曲線，不是純灰階工具面板
- 明確的視覺層級：標題 / 內文 / 輔助說明 / 操作區清楚分離
- 一致的間距系統與網格
- 可預期的互動回饋（hover、focus、active、disabled）
- 適度微動畫強化狀態變化，尊重 `prefers-reduced-motion`

---

## 2. 設計決策總表

| 面向 | 決策 |
|------|------|
| 品牌調性 | 漸進式揭露：表層 B（友善溫暖）+ 深層 A（專業強大） |
| 品牌色 | 藍紫色系（hue 270, oklch） |
| 圓角 | 中圓角 8–12px |
| 字體 | Inter（可變字體）+ CJK 系統字體 fallback |
| 導覽 | 預設精簡（6 核心項目），可展開/固定 |
| 空狀態 | 豐富引導：情境說明 + CTA + 教學/範本入口 |
| 動畫 | 活潑有感：彈跳回饋、交錯進場、拖拽彈性、數字跳動、skeleton 微光 |
| Icon | 使用現有 Lucide React，不新增複雜自訂 SVG |

---

## 3. Design Token 系統

### 3.1 色彩系統

所有色彩以 oklch 色彩空間定義，確保感知均勻，deep/dark mode 下只調整 Lightness。

#### 品牌主色（藍紫）

```css
--color-primary-50:  oklch(0.97 0.015 270);
--color-primary-100: oklch(0.93 0.04  270);
--color-primary-200: oklch(0.82 0.10  270);
--color-primary-300: oklch(0.70 0.18  270);
--color-primary-400: oklch(0.65 0.20  270);
--color-primary-500: oklch(0.55 0.24  270);  /* 主 CTA、連結、選中態 */
--color-primary-600: oklch(0.48 0.23  270);
--color-primary-700: oklch(0.45 0.22  270);
--color-primary-900: oklch(0.35 0.18  270);
```

#### 帶色調灰階（Neutral，hue 270 微量）

純灰 chroma=0 會有冰冷感。所有 neutral 帶一絲 hue 270（chroma 0.005–0.015）消除此問題。

```css
--color-neutral-50:  oklch(0.985 0.005 270);
--color-neutral-100: oklch(0.96  0.008 270);
--color-neutral-200: oklch(0.92  0.010 270);  /* 邊框 */
--color-neutral-300: oklch(0.85  0.012 270);  /* 分隔線 */
--color-neutral-400: oklch(0.70  0.015 270);  /* placeholder */
--color-neutral-500: oklch(0.55  0.015 270);  /* 次要文字 */
--color-neutral-700: oklch(0.40  0.015 270);  /* 主文字 */
--color-neutral-900: oklch(0.20  0.015 270);  /* 標題 */
--color-neutral-950: oklch(0.145 0.015 270);  /* 深色主題背景 */
```

#### 語意色（柔和版）

背景統一 L≈0.95（接近白，只留淡色調），文字彩度降低（chroma 0.13–0.16）。

```css
/* Success */
--color-success-text: oklch(0.48 0.15 145);
--color-success-bg:   oklch(0.93 0.06 145);
--color-success-border: oklch(0.86 0.08 145);

/* Warning */
--color-warning-text: oklch(0.58 0.14 75);
--color-warning-bg:   oklch(0.95 0.05 85);
--color-warning-border: oklch(0.88 0.08 85);

/* Error */
--color-error-text:   oklch(0.50 0.16 25);
--color-error-bg:     oklch(0.95 0.04 25);
--color-error-border: oklch(0.88 0.07 25);

/* Info */
--color-info-text:    oklch(0.52 0.13 235);
--color-info-bg:      oklch(0.95 0.04 235);
--color-info-border:  oklch(0.88 0.07 235);
```

#### 語意映射（Semantic Aliases）

現有 `--background`、`--foreground`、`--primary` 等 CSS 變數沿用，但值改為引用上方 token：

```css
:root {
  --background:        var(--color-neutral-50);
  --foreground:        var(--color-neutral-900);
  --primary:           var(--color-primary-500);
  --primary-foreground: white;
  --border:            var(--color-neutral-200);
  --muted:             var(--color-neutral-100);
  --muted-foreground:  var(--color-neutral-500);
  --ring:              var(--color-primary-500);
  --radius:            8px;  /* 從 0 改為 8px */
}

.dark {
  --background:  var(--color-neutral-950);
  --foreground:  oklch(0.985 0.005 270);
  --card:        oklch(0.20 0.015 270);
  --border:      oklch(0.28 0.015 270);
  --muted:       oklch(0.25 0.015 270);
  --muted-foreground: oklch(0.65 0.015 270);
}
```

### 3.2 字體系統

```css
--font-sans: 'Inter var', 'Inter', -apple-system, BlinkMacSystemFont,
             "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

**載入策略：** Inter Variable Font 單一 woff2 檔，支援 wght 100–900。從 Google Fonts 或自建 CDN 載入。

### 3.3 字級階梯（Minor Third 比例，1.2x）

```css
--text-2xs:  0.625rem;  /* 10px — 極小標籤 */
--text-xs:   0.75rem;   /* 12px — Badge、輔助說明 */
--text-sm:   0.875rem;  /* 14px — 表格欄位、側欄項目 */
--text-base: 1rem;      /* 16px — 內文預設 */
--text-lg:   1.125rem;  /* 18px — 卡片標題、區塊標題 */
--text-xl:   1.25rem;   /* 20px — 頁面副標 */
--text-2xl:  1.5rem;    /* 24px — 頁面標題 */
--text-3xl:  1.875rem;  /* 30px — Dashboard 大數字 */
--text-4xl:  2.25rem;   /* 36px — Landing 大標 */
```

### 3.4 間距系統（4px 基礎單位）

```css
--space-px2:  0.125rem; /* 2px */
--space-1:    0.25rem;  /* 4px */
--space-2:    0.5rem;   /* 8px  — 元件內最小 padding */
--space-3:    0.75rem;  /* 12px */
--space-4:    1rem;     /* 16px — 常用 gap/padding */
--space-6:    1.5rem;   /* 24px — 區塊間距 */
--space-8:    2rem;     /* 32px — 大區塊間距 */
--space-12:   3rem;     /* 48px — 頁面 section 間距 */
--space-16:   4rem;     /* 64px — 頁面邊距 */
```

### 3.5 圓角

```css
--radius-sm:   6px;     /* Badge、小元素 */
--radius-md:   8px;     /* Button、Input（主要使用） */
--radius-lg:   12px;    /* Card、Dialog */
--radius-xl:   16px;    /* 大面板 */
--radius-full: 9999px;  /* Pill、Avatar */
```

注意：現有 `--radius: 0` 改為 `--radius: var(--radius-md)` = 8px。

### 3.6 陰影

```css
--shadow-xs: 0 1px 2px 0 oklch(0 0 0 / 0.05);
--shadow-sm: 0 1px 3px 0 oklch(0 0 0 / 0.08), 0 1px 2px -1px oklch(0 0 0 / 0.06);
--shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.08), 0 2px 4px -2px oklch(0 0 0 / 0.05);
--shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.08), 0 4px 6px -4px oklch(0 0 0 / 0.04);
--shadow-xl: 0 20px 25px -5px oklch(0 0 0 / 0.08), 0 8px 10px -6px oklch(0 0 0 / 0.04);
```

深色模式下陰影顏色自動加深（`oklch(0 0 0 / 0.25)` 起步）。

### 3.7 行高

```css
--leading-tight:   1.25;  /* 標題 */
--leading-normal:  1.5;   /* 內文 */
--leading-relaxed: 1.7;   /* 長文閱讀 */
```

### 3.8 動畫 Token

```css
--duration-fast:   120ms;
--duration-normal: 200ms;
--duration-slow:   350ms;
--duration-spring: 500ms;

--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in:      cubic-bezier(0.4, 0, 1, 1);
--ease-out:     cubic-bezier(0, 0, 0.2, 1);
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);  /* 彈性回饋 */
```

---

## 4. 元件層架構

### 4.1 分層結構

```
packages/ui/                  ← 可發佈 npm package: @paperclipai/ui
├── src/
│   ├── tokens.css            ← Layer 0: Design Tokens
│   ├── base.css              ← Layer 1: Reset + Font + Scrollbar + Focus
│   ├── layout/               ← Layer 2: Layout Primitives
│   │   ├── container.css
│   │   ├── stack.css
│   │   ├── grid.css
│   │   └── split-panel.css
│   ├── components/           ← Layer 3: UI Components
│   │   ├── action/           button.css, icon-button.css, dropdown-menu.css
│   │   ├── form/             input.css, select.css, textarea.css, checkbox.css, switch.css, label.css
│   │   ├── data/             card.css, table.css, badge.css, avatar.css, skeleton.css, empty-state.css
│   │   ├── overlay/          dialog.css, sheet.css, popover.css, command.css
│   │   ├── feedback/         toast.css, inline-alert.css, spinner.css, progress.css
│   │   └── nav/              sidebar.css, breadcrumb.css, mobile-bottom-nav.css, tabs.css
│   └── index.css             ← 統一入口，按順序 @import 以上所有檔案
├── package.json
└── README.md
```

### 4.2 npm Package 規格

```json
{
  "name": "@paperclipai/ui",
  "version": "1.0.0",
  "main": "src/index.css",
  "exports": {
    ".": "./src/index.css",
    "./tokens": "./src/tokens.css",
    "./base": "./src/base.css"
  },
}
```

### 4.3 元件清單與規格

#### Action
- **Button** — 6 variants (default/destructive/outline/secondary/ghost/link) × 6 sizes (xs/sm/default/lg/icon-xs/icon-sm/icon/icon-lg)，含 loading 態（spinner 替換文字，寬度不跳動）
- **IconButton** — Button 的 icon-only 變體，確保觸控目標 ≥ 44px
- **DropdownMenu** — Radix UI，scale + fade 動畫，鍵盤可操作

#### Form
- **Input** — focus 時品牌色邊框，invalid 時 error 色，含清除按鈕變體
- **Select** — 統一觸控高度，含搜尋變體
- **Textarea** — 自動擴展高度，字數限制指示
- **Checkbox / Switch** — 勾選時彈跳動畫，focus-visible ring
- **Label** — 與 Input 語義關聯，required 標示

#### Data Display
- **Card** — 含 header/content/footer 插槽，hover 微浮起，loading 用 Skeleton
- **Table** — sticky header，排序動畫，bulk select，行 hover 背景
- **Badge** — 8 semantic variants，pill 形狀選項
- **Avatar** — 圓形/方形，fallback initials，group 堆疊
- **Skeleton** — shimmer 動畫，支援文字/圓形/矩形形狀
- **EmptyState** — 情境化插圖（用 Lucide 大圖示）+ 標題 + 說明 + CTA + 可選教學/範本連結

#### Overlay
- **Dialog** — backdrop blur，scale 0.97→1 進場，正確 focus trap
- **Sheet** — 右/底側滑入，backdrop，可設定寬度
- **Popover** — scale + fade，智能定位
- **Command** — cmdk，模糊搜尋，分組，快捷鍵顯示

#### Feedback
- **Toast** — 右下角滑入，4 variants，progress bar 自動消失，可堆疊
- **InlineAlert** — 4 semantic variants，帶色調背景（語意色柔和版）
- **Spinner** — 品牌色旋轉弧線，多種尺寸
- **Progress** — 線型/環型，微光掃過動畫

#### Navigation
- **Sidebar** — 深色背景，漸進式揭露，折疊/展開動畫，mobile overlay
- **CompanyRail** — 最左欄，公司切換，avatar + badge 未讀數
- **BreadcrumbBar** — 麵包屑 + 頁面標題 + 右側操作區
- **MobileBottomNav** — 手機底部導覽，safe-area-inset 支援
- **Tabs** — 底線滑動動畫，overflow 左右捲動

---

## 5. 動畫系統

### 5.1 動畫規範

| 類型 | 效果 | 時長 | Easing |
|------|------|------|--------|
| 頁面進場 | fade-in + translateY(8px→0) | 200ms | ease-out |
| 列表交錯 | 每項 +30ms delay，最多 15 項 | 200ms | ease-out |
| Hover/Active | 背景色、陰影漸變 | 120ms | ease |
| 成功彈跳 | scale(0→1.15→1) | 300ms | spring |
| 刪除收合 | 淡出 + max-height 收至 0 | 300ms | ease-in |
| 新增閃現 | 品牌色背景閃現 + 淡出 | 500ms | ease |
| 數字跳動 | counting animation（JS 輔助） | 800ms | ease-out |
| Drag 拾起 | scale(1.02) + shadow 提升 | 150ms | ease-out |
| Drag 放下 | 彈性歸位 | 500ms | spring |
| Dialog 進場 | backdrop fade + scale(0.97→1) + fade | 200ms | ease-out |
| Sheet 進場 | translateX(100%→0) | 350ms | ease-out |
| Toast 進場 | translateX(100%→0) + fade | 200ms | ease-out |
| Skeleton shimmer | gradient 左→右掃 | 1500ms | linear, infinite |

### 5.2 Reduced Motion 降級

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 100ms !important;
    transition-duration: 100ms !important;
    animation-iteration-count: 1 !important;
  }
  /* 取消位移、縮放，僅保留 fade */
  .stagger-item { animation: none; opacity: 1; }
  .shimmer { animation: none; }
  .count-animation { transition: none; }
}
```

### 5.3 互動狀態矩陣

每個可互動元件必須覆蓋：

| 元件 | Hover | Focus-visible | Active | Disabled | Loading |
|------|-------|--------------|--------|----------|---------|
| Button | 色彩漸變 120ms | 品牌色 ring 3px | 按壓暗沉 | 50% opacity | Spinner（寬不變） |
| Input | 邊框加深 | 品牌色邊框 + ring | — | 灰背景 | — |
| Card（可點擊） | translateY(-2px) + shadow↑ | ring | 壓回 | — | Skeleton |
| Row | 背景淡入 | 左側品牌色 4px 條 | 加深 | — | — |
| Nav Item | 背景淡入 | ring | 品牌色背景 | — | — |

---

## 6. 版面配置

### 6.1 桌面版面（≥1024px）

```
┌──────┬────────────────────┬───────────────────────────┐
│      │                    │                           │
│  52px│      200px         │     主內容區              │
│  Co- │      Sidebar       │     BreadcrumbBar         │
│  mp- │      (深色)        │     ─────────────────     │
│  any │                    │     Outlet（頁面內容）    │
│  Rail│                    │                           │
│      │                    │     [可選] PropertiesPanel│
└──────┴────────────────────┴───────────────────────────┘
```

- CompanyRail 寬度：52px，深色背景 oklch(0.10 0.015 270)
- Sidebar 寬度：200px（展開）/ 48px（icon-only，平板）
- 主內容區：flex:1，最大寬 1200px（wide 模式置中）

### 6.2 漸進式揭露導覽

**預設狀態（新用戶）：**
- 顯示 6 個核心項目：Dashboard / Issues / Agents / Projects / Chat / Inbox
- 底部顯示「＋ 更多」折疊按鈕

**展開狀態（手動）：**
- 點「更多」展開完整導覽
- 額外項目：Goals / Approvals / Costs / Schedules / Governance / Activity
- 顯示「固定」按鈕

**固定狀態（工程師模式）：**
- 展開狀態持久化（localStorage key: `paperclip.sidebar.expanded`）
- 支援拖排自訂項目順序

### 6.3 響應式斷點

| 斷點 | 寬度 | 行為 |
|------|------|------|
| mobile | < 768px | CompanyRail+Sidebar 隱藏，MobileBottomNav 出現，全寬單欄，複雜流程 → Sheet |
| tablet | 768–1024px | CompanyRail 顯示，Sidebar icon-only (48px)，點擊展開為 overlay |
| desktop | 1024–1440px | 標準三欄佈局 |
| wide | > 1440px | 主內容區最大 1200px 置中，可雙欄（列表+詳情） |

---

## 7. 頁面分類與處理策略

### 7.1 頁面分類

51 個頁面分為 5 類，按優先順序處理：

**P0 — 核心用戶日常（最高頻率）**
Dashboard, Issues, MyIssues, IssueDetail, Agents, AgentDetail, Chat, ChatRoom, Projects, ProjectDetail

**P1 — 管理與設定**
CompanySettings, CompanySkills, CompanyBilling, CompanyAutomation, Account, Goals, GoalDetail

**P2 — 進階功能（工程師）**
CompanyWorkflowEdit, AgentConfigForm（內部）, Governance, ComplianceRetentionSettings, ArchiveCompanySettings, Schedules, Approvals, ApprovalDetail

**P3 — 分析與監控**
Dashboard（趨勢圖）, Costs, Activity, RunQuality, GoalMap, OrgChart

**P4 — Instance 管理（超級管理員）**
InstanceSettings, InstanceUserManagement, InstanceGroupManagement, InstanceCompanyManagement, InstancePlansSettings

**P5 — 特殊頁面**
Landing, PricingPage, Auth, InviteLanding, TenantSelect, NotFound, BoardClaim

### 7.2 空狀態規格

每個主要列表頁必須有豐富空狀態，包含：
1. Lucide 大圖示（64px，品牌色調，低彩度）
2. 標題（`--text-xl`，font-weight 600）
3. 說明文字（`--text-sm`，`--color-neutral-500`，最多 2 行）
4. 主要 CTA 按鈕（`variant="default"`）
5. 可選：範本快速入口 或 教學連結

### 7.3 載入狀態規格

- **資料查詢中**：PageSkeleton，覆蓋當前版面結構的 Skeleton 佔位
- **操作進行中**：Button loading 態，spinner 替換文字
- **局部刷新**：局部 Skeleton，不整頁閃爍

---

## 8. npm Package 規格（@paperclipai/ui）

### 8.1 入口結構

```
packages/ui/
├── package.json
├── src/
│   └── index.css        ← @import 所有層
└── README.md
```

### 8.2 package.json

```json
{
  "name": "@paperclipai/ui",
  "version": "1.0.0",
  "description": "Paperclip 設計系統 — Design Tokens + UI Components CSS",
  "main": "src/index.css",
  "exports": {
    ".":           "./src/index.css",
    "./tokens":    "./src/tokens.css",
    "./base":      "./src/base.css"
  },
  "keywords": ["paperclip", "design-system", "css", "ui"]
}
```

### 8.3 應用程式引用方式

```typescript
// ui/src/main.tsx
import '@paperclipai/ui';  // 一行引入全部樣式
```

業務頁面不直接散落裸樣式，透過 CSS custom properties + data-slot 元件屬性使用。

---

## 9. 禁止清單（實作時主動檢查）

- [ ] 圖示與文字重疊或對齊錯亂
- [ ] 表單輸入寬度失控導致與鄰近元素重疊
- [ ] 內容寬度超出視窗造成水平捲動
- [ ] 觸控目標 < 44px（`@media (pointer: coarse)` 下強制 min-height 44px）
- [ ] 對比度不足（文字/背景 < WCAG AA 4.5:1）
- [ ] Focus-visible 樣式缺失
- [ ] 動畫未尊重 `prefers-reduced-motion`
- [ ] 窄螢幕上導覽與主要 CTA 被擠出視野
- [ ] inline style 出現在 HTML 中（禁止，全部移至 CSS）
- [ ] 新增複雜自訂 SVG（使用 Lucide React 替代）
- [ ] Tailwind CSS 或 utility-first 方案（禁止）

---

## 10. 實作執行順序

### Phase 1 — 基礎（token + 全域樣式）
1. 建立 `packages/ui/` 結構
2. 撰寫 `tokens.css`（完整 token 定義）
3. 撰寫 `base.css`（reset + font-face + scrollbar + focus）
4. 更新 `ui/src/index.css` 引用新 package
5. 更新 `--radius: 0` → `--radius: var(--radius-md)` 並驗證全局圓角

### Phase 2 — 核心元件重構
6. Button（載入態、動畫）
7. Input / Select / Textarea（focus 動畫）
8. Card（hover 浮起動畫）
9. Toast（滑入動畫、堆疊）
10. Dialog / Sheet（進出場動畫）
11. Skeleton（shimmer 動畫）
12. EmptyState（豐富引導版本）
13. Spinner / Progress

### Phase 3 — 版面與導覽
14. Sidebar（漸進式揭露機制）
15. CompanyRail（更新樣式）
16. BreadcrumbBar（更新樣式）
17. MobileBottomNav（更新樣式）
18. PageSkeleton（更新以匹配新排版）

### Phase 4 — P0 頁面
19. Dashboard（Metric Cards、Charts、Activity）
20. Issues / IssueDetail（列表動畫、空狀態）
21. Agents / AgentDetail
22. Chat / ChatRoom
23. Projects / ProjectDetail

### Phase 5 — P1–P3 頁面
24. Settings 系列（CompanySettings、Account 等）
25. Goals / GoalDetail / GoalMap
26. Approvals / ApprovalDetail
27. Costs / Activity / RunQuality

### Phase 6 — P4–P5 頁面 + 壓力測試
28. Instance 管理頁面
29. Landing / Pricing / Auth / 特殊頁面
30. 跨斷點壓力測試（長表格、長表單、多欄）
31. 禁止清單逐項驗證
