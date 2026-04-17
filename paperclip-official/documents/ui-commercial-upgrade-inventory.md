# 消費級 UI 升級：路由 × 狀態矩陣與元件對照

> 頁面清單以 [`ui/src/App.tsx`](../ui/src/App.tsx) 為權威來源。狀態欄為各畫面應涵蓋或已涵蓋的 UI 狀態（實作時請依資料來源補齊）。

## 元件對照表（data-slot ↔ CSS ↔ React）

| data-slot / 契約 | Design-system CSS | React 包裝（`ui/src/components/ui`） | 應用層覆寫 |
|------------------|-------------------|--------------------------------------|------------|
| `button` | `components/button.css` | `button.tsx` | `styles/ui.css` |
| `input`, `textarea` | `components/input.css` | `input.tsx`, `textarea.tsx` | `styles/ui.css` |
| `card` | `components/card.css` | `card.tsx` | — |
| `badge` | `components/badge.css` | `badge.tsx` | — |
| `dialog` | `components/dialog.css` | `dialog.tsx` | — |
| `sheet` | `components/sheet.css` | `sheet.tsx` | — |
| `toast` | `components/toast.css` | `ToastViewport` + context | — |
| `popover` | `components/popover.css` | `popover.tsx` | — |
| `tabs` | `components/tabs.css` | `tabs.tsx` | — |
| `tooltip` | `components/tooltip.css` | `tooltip.tsx` | — |
| `inline-alert` | `components/inline-alert.css` | （純標記 + `data-slot`） | — |
| `empty-state` | `components/empty-state.css` | `EmptyState.tsx` | — |
| `skeleton` | `components/skeleton.css` | `skeleton.tsx` | — |
| `spinner` | `components/spinner.css` | 各頁使用 | — |
| `ds-container`, `ds-stack`, `ds-grid` | `components/layout.css` | — | — |
| `ds-table` | `components/table.css` | — | — |
| `ds-field` | `components/form-field.css` | — | — |
| `ds-search` | `components/search-field.css` | — | — |
| `ds-switch` | `components/switch.css` | 建議以 `button[role="switch"]` + `data-slot` | 既有 `ios-switch` / `ui-agent-switch` 漸進遷移 |

## 側邊欄漸進導覽（Board）

| 項目 | 說明 |
|------|------|
| 設定來源 | [`ui/src/lib/navConfig.ts`](../ui/src/lib/navConfig.ts)（`primaryNavItems`、`secondaryWorkNavItems`、`secondaryCompanyNavItems`、`fullModeCompanyNavItems`、`allBoardNavItemsForPalette`） |
| 元件 | [`ui/src/components/Sidebar.tsx`](../ui/src/components/Sidebar.tsx)、[`SidebarProjects.tsx`](../ui/src/components/SidebarProjects.tsx)、[`SidebarAgents.tsx`](../ui/src/components/SidebarAgents.tsx) |
| 指令面板 | [`ui/src/components/CommandPalette.tsx`](../ui/src/components/CommandPalette.tsx) 的 Pages 群組由 `allBoardNavItemsForPalette` 映射 |
| 樣式 | [`ui/src/styles/board.css`](../ui/src/styles/board.css)（`.board-sidebar-nav-group-gap`、`.board-sidebar-pin-row` 等） |
| 持久化 | `paperclip.sidebar.expanded`（固定完整）、`paperclip.sidebar.moreOpen`、`paperclip.sidebar.projectsOpen`、`paperclip.sidebar.agentsOpen` |
| 精簡 vs 完整 | **精簡**：主列含儀表板、收件匣、議題、目標、聊天、專案／員工列表、核准、帳單、設定、成本；「更多」僅剩排程／工作流程／執行品質與部分公司項（組織圖、目標圖、治理、自動化、活動）。**不**顯示專案／員工側欄樹。**固定完整**：顯示樹狀區與分區工作／公司列。 |

## 公開路由（無 `:companyPrefix`）

| 路徑 | 頁面元件 | 載入 | 空 | 錯誤 | 成功 | 權限 | 驗證 | 長列表/寬表 |
|------|-----------|------|-----|------|------|------|------|----------------|
| `/` | `CompanyRootRedirect` | ✓ | — | — | redirect | — | — | — |
| `/landing` | `Landing` | ✓ | — | ✓ | ✓ | — | ✓ | — |
| `/auth` | `AuthPage` | ✓ | — | ✓ | ✓ | — | ✓ | — |
| `/invite/:token` | `InviteLandingPage` | ✓ | — | ✓ | ✓ | — | ✓ | — |
| `/board-claim/:token` | `BoardClaimPage` | ✓ | — | ✓ | ✓ | — | ✓ | — |
| `/tenant-select` | `TenantSelectPage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `/onboarding` | `OnboardingRoutePage` | ✓ | — | — | ✓ | — | — | — |
| `/instance/settings` | `InstanceSettings` | ✓ | — | ✓ | ✓ | ✓ | ✓ | — |
| `/instance/default-company-path` | `Navigate` → `/instance/companies` | redirect | — | — | redirect | ✓ | ✓ | — |
| `/instance/compliance-retention` | `ComplianceRetentionSettings` | ✓ | — | ✓ | ✓ | ✓ | ✓ | — |
| `/instance/archive-company` | `Navigate` → `/instance/companies` | redirect | — | — | redirect | ✓ | ✓ | — |
| `/instance/companies` | `InstanceCompanyManagement`（含預設路徑、封存/刪除、Cleanup） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/instance/groups` | `InstanceGroupManagement` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/instance/users` | `InstanceUserManagement` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/instance/plans` | `InstancePlansSettings` | ✓ | — | ✓ | ✓ | ✓ | ✓ | — |
| `/account` | `Account` | ✓ | — | ✓ | ✓ | — | ✓ | — |
| `CloudAccessGate` | （閘道） | ✓ | — | ✓ | — | ✓（封禁） | — | — |

## Board 路由（`/:companyPrefix/...`，`boardRoutes`）

| 路徑片段 | 頁面 | 載入 | 空 | 錯誤 | 長內容 |
|----------|------|------|-----|------|--------|
| `dashboard` | Dashboard | ✓ | ✓ | ✓ | 圖表 |
| `companies` | Companies | ✓ | ✓ | ✓ | 列表 |
| `company/settings` | CompanySettings | ✓ | — | ✓ | 表單 |
| `company/billing` | CompanyBilling | ✓ | — | ✓ | — |
| `pricing` | PricingPage | ✓ | — | ✓ | — |
| `company/automation` | CompanyAutomation | ✓ | — | ✓ | — |
| `org` | OrgChart | ✓ | ✓ | ✓ | 樹狀 |
| `goal-map` | GoalMap | ✓ | ✓ | ✓ | — |
| `agents/*` | Agents / NewAgent / AgentDetail | ✓ | ✓ | ✓ | 列表／詳情 |
| `projects/*` | Projects / ProjectDetail | ✓ | ✓ | ✓ | 列表／子頁 |
| `issues` | Issues | ✓ | ✓ | ✓ | Kanban／列表 |
| `issues/:id` | IssueDetail | ✓ | — | ✓ | 執行緒／屬性 |
| `goals/*` | Goals / GoalDetail | ✓ | ✓ | ✓ | — |
| `schedules` | Schedules | ✓ | ✓ | ✓ | — |
| `company/workflows` | CompanySkills | ✓ | ✓ | ✓ | — |
| `company/workflows/new`, `.../edit` | CompanyWorkflowEdit | ✓ | — | ✓ | 編輯器 |
| `runs` | RunQuality | ✓ | ✓ | ✓ | 列表 |
| `approvals/*` | Approvals / ApprovalDetail | ✓ | ✓ | ✓ | — |
| `costs` | Costs | ✓ | — | ✓ | 圖表 |
| `governance` | Governance | ✓ | — | ✓ | — |
| `activity` | Activity | ✓ | ✓ | ✓ | 時間線 |
| `inbox/*` | Inbox | ✓ | ✓ | ✓ | 列表 |
| `chat`, `chat/:roomId` | Chat / ChatEmpty / ChatRoom | ✓ | ✓ | ✓ | 訊息流 |
| `account` | Account | ✓ | — | ✓ | — |
| `design-guide` | DesignGuide | — | — | — | 展示 |
| `tests/ux/runs` | RunTranscriptUxLab | ✓ | — | ✓ | — |
| `*` | NotFoundPage | — | — | — | — |

## 殼層 z-index（`tokens.css`）

| 變數 | 用途 |
|------|------|
| `--z-board-breadcrumb-sticky` | 麵包屑 sticky |
| `--z-board-mobile-nav` | 手機底欄、無公司時底部工具列 |
| `--z-drawer-backdrop` | 側欄抽屜背板 |
| `--z-mobile-drawer` | 手機側欄本體（低於 `--z-dialog`） |
| `--z-dialog` | 對話框 |
| `--z-toast` | Toast |

## 第一波遷移（已套用）

- 閘道／載入／錯誤：`app-gate-*` 改為權杖化間距、陰影、`app-gate-wrap--viewport` 置中。
- `CompanyRootRedirect`、閘道 loading：移除 utility class，改語意化閘道樣式。
- `NotFound` 外殼：權杖化 `max-width`／`padding`／`radius`。
- 設計系統：新增 `layout`、`table`、`form-field`、`search-field`、`switch` CSS，供各頁漸進採用。
- **Dashboard**：頁面與網格間距改為 `--layout-stack-gap-lg`／`--layout-grid-gap`；media query 對齊權杖斷點（`30rem`、`46.5rem`、`64rem`、`80rem`）；載入錯誤與無 Agent 提示改 `data-slot="inline-alert"` + `Button`；新增 `PageSection`、`DashboardRecentIssueRow`；`MetricCard` 樣式移至 `MetricCard.css`。
- **Dashboard（第二階段佈局）**：頁首 `h1` + 副標；資訊順序改為 KPI → 圖表 → 趨勢 → 活動／議題；`ActiveAgentsPanel` 置於 `aside`，`≥80rem` 時與主欄雙欄 grid、`sticky` 捲動；側欄內 agent 網格強制單欄；圖表卡標題／圖例字級改權杖；`PageSkeleton` 對齊新骨架；`ActiveAgentsPanel` 標題改用 `PageSection`。

## 維護說明

- 新增路由時：更新本表與 Design Guide「Component coverage」。
- 驗收截圖：至少涵蓋 `design-guide`、dashboard、issues、issue detail、chat、instance settings、landing、auth。
