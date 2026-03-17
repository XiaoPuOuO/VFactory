### 總體回答

**整個專案已經非常接近 SPEC-implementation 的 V1 完整實作**，多租戶、company-scoped 資料模型、agents/adapters、heartbeat、issues（含 atomic checkout）、approvals、budget/costs、chat、activity_log、company portability 等核心能力都有落地；接下來可做的功能，主要是在「產品化體驗、治理與策略化控制」上加強。

以下我用層級幫你整理「還可以做什麼功能」，方便之後排期。

---

### Level 1：低成本、立即提升體驗的功能

- **Chat ↔ Issue 整合強化（已完成✅）**
  - **機會**：現在 chat 與 issues 有 schema 上的關聯（例如 `sourceChatRoomId`），但 UX 還不算一條龍。
  - **建議功能**：  
    - 在聊天室訊息上提供「建立 Issue」與「附加到現有 Issue」。  
    - 自動帶入訊息內容為 issue title/description。  
    - 在 issue detail 顯示「來自哪個 chat room」並可跳回對話。
  - **影響層**：Server（issues/chat routes 聚合）、UI（`ChatRoom`、`IssueDetail`）、Doc（board/agent 使用手冊）。

- **Board Inbox 強化（真正變成「需要人處理的佇列」）（已完成✅）**
  - **機會**：現在 Inbox 已存在，但可以更偏「待辦中心」，聚焦需要人介入的事件。
  - **建議功能**：  
    - Inbox 裡集中：pending approvals、失敗的 heartbeat runs、被 budget 停用的 agents、blocked issues。  
    - 每一種事件都有快捷操作與明顯狀態。
  - **影響層**：Server（新增或擴充 inbox 聚合 endpoint）、UI（`Inbox` 頁面）、Doc（board 工作流說明）。

- **Agent Chat Memories 可視化與管理**
  - **機會**：`agent_chat_memories` 已實作，但對 board 來說是黑盒。
  - **建議功能**：  
    - 在 Agent 詳細頁新增「Memories」tab：列表、搜尋、刪除單筆或全部。  
  - **影響層**：主在 UI（`AgentDetail`），Server 已有基礎 route，Doc 更新 agent 開發者指南。

- **Budget hit / auto-pause 的可見性**
  - **機會**：現在 hard limit auto-pause 機制存在，但 UI 上可以再清楚一點。
  - **建議功能**：  
    - 在 agents list / detail 顯示「因預算上限自動暫停」的 badge。  
    - 在 Costs 頁面提供「歷史 budget breach」區塊。
  - **影響層**：Server（dashboard/costs 回傳 breach metadata）、UI（`Dashboard`、`Costs`）、Doc（成本治理章節）。

---

### Level 2：中型功能（加深控制平面價值）

- **Issue Worktree / Execution Workspace UX 正式落地**
  - **現況**：schema 與 server services 已有（`project_workspaces`、workspace runtime policy），UI 有多個 `// TODO(issue-worktree-support)` 被暫時關閉。
  - **建議功能**：  
    - 在 project 設定多 workspace（mono-repo 子目錄等）。  
    - 在 issue 層選擇 workspace / branch（遵守 execution policy）。  
    - 前後端串起，讓 agent 真正以這個 workspace 執行。
  - **影響層**：DB/Shared（可能補 index/types）、Server（workspace policy, issues/agents service）、UI（重新啟用並完成相關 TODO）、Doc（新增「Execution Workspace / Issue Worktree」指南）。

- **Goal / Project / Issue 對齊的「Goal Progress」視圖**
  - **機會**：Goal / Project / Issue / Cost 關係已建，但還缺一個上層總覽。
  - **建議功能**：  
    - 建立 Goal Progress 視圖：從某個 goal 看其底下 projects / issues 的狀態與總成本。  
    - 支援 drill-down。
  - **影響層**：Server（新 progress 聚合 endpoint）、UI（`GoalMap` 或新頁）、Doc（目標管理）。

- **Governance Hub（審批與策略中心）**
  - **機會**：Approvals 通用模型已具備，但治理狀態分散在多個頁面。
  - **建議功能**：  
    - 新的 Governance Hub 專頁：集中 pending approvals、已生效策略（例如 hire_agent / CEO strategy）、關聯 issues。  
    - 清楚標記每一類 approval 的影響範圍。
  - **影響層**：Server（governance 彙總 service）、UI（新頁或在 Approvals 上層加一層 dashboard）、Doc（governance section）。

- **進階成本視覺化：Billing code 與 request depth**
  - **機會**：schema 已有 `billing_code` / `request_depth`，但 UI 利用程度有限。
  - **建議功能**：  
    - Costs 視圖中新增：  
      - 依 billing_code 分佈的成本圖表。  
      - 依 request_depth 觀察跨團隊委託鏈深度。
  - **影響層**：Server（`costs` service 擴充）、UI（`Costs` 頁面圖表）、Doc（成本歸屬說明）。

---

### Level 3：策略級、長期價值功能

- **更完整的治理模型：多 Board 成員與授權委任**
  - **機會**：目前權限模型相對簡化，SPEC 有多 board / delegated authority 的長期想法。
  - **建議功能**：  
    - 在 tenant/company 層支援多 Board 成員與細緻角色。  
    - 定義「在某些閾值內自動批准」之 delegated rules（例如小額 hire_agent 自動通過）。  
    - Audit 視圖標示是自動還是人工批准。
  - **影響層**：DB（membership 權限擴充或新策略表）、Server（authz middleware、approvals service）、UI（Instance/Company settings + Governance Hub）、Doc（governance 模型）。

- **多維度 Budget Policy 引擎**
  - **機會**：目前 budget 主要是 company/agent 月度上限，可再拓展為多維度策略。
  - **建議功能**：  
    - 新增 budget policy 模型：按 project / billing_code / 時間窗定義上限。  
    - 在成本 ingestion 與 scheduler 中套用這些策略；UI 設定與監控。
  - **影響層**：DB（`budget_policies`）、Server（costs & scheduler）、UI（Costs / Settings）、Doc（策略示例）。

- **非 adapter 型 Plugin 架構**
  - **機會**：adapter 已抽象良好，但其他擴充（knowledge、revenue、外部 metrics）尚未有通用插件介面。
  - **建議功能**：  
    - 在 server 定義 plugin interface + event bus（訂閱 activity log / domain events）。  
    - DB 管理 plugin 啟用與設定；UI 提供 plugin 管理頁。
  - **影響層**：DB（plugins/configs）、Server（plugin loader + hooks）、UI（Instance settings / plugin 管理）、Doc（plugin 開發者指南）。

- **Company Template / Portability 產品化**
  - **現況**：SPEC-implementation 已定義 manifest 與 export/import，程式碼也有 routes，但 UX 尚未當成完整 template 系統經營。
  - **建議功能**：  
    - Onboarding / Company settings 中加入「基於 template 建新公司」與「匯出為 template」。  
    - 內建幾個官方模板（工程 org、agency 等），未來可接 ClipHub。
  - **影響層**：Server（export/import metadata）、UI（OnboardingWizard / CompanySettings / InstanceCompanyManagement）、Doc（Template / Portability）。

---

如果你願意，我可以幫你從上述清單中，挑一個你最在意的方向（例如「先把 Issue Worktree 做完」或「先強化 Chat ↔ Issue」），直接進入具體技術設計與實作計畫（包含影響檔案列表、API 設計草稿、DB 變更方案）。