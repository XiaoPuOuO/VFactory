# Execution workspace 與 Issue 工作目錄

## 概念

- **專案工作區**（`project_workspaces`）：專案可有多個工作區，每個對應一個本機 `cwd`（或僅 repo 中繼資料）。適用 mono-repo 多子目錄等情境。
- **執行工作區策略**（`projects.execution_workspace_policy`）：可選擇是否啟用「獨立議題領取」（例如以 git worktree 建立 issue 專用目錄），並設定 branch 範本、provision 指令等。
- **議題設定**（`issues.execution_workspace_settings`）：JSON，可包含：
  - `mode`：`project_primary` | `isolated` | `agent_default` | `inherit`
  - **`projectWorkspaceId`**：uuid，對應 `project_workspaces.id`，指定此議題優先使用哪個專案工作目錄。
  - `workspaceStrategy` / `workspaceRuntime`：進階覆寫（與 adapter 設定合併）。

## 執行時行為

1. Heartbeat 建立 run 時會解析議題的 `execution_workspace_settings` 與專案 policy，決定是否使用獨立 worktree 等。
2. 解析本機 **專案 cwd** 時，若議題帶有 `projectWorkspaceId` 且該列屬於同一專案，會**優先**嘗試該工作區的路徑；若該路徑尚不可用，會降級嘗試其他工作區並在警告中說明。
3. Git worktree 實作（`realizeExecutionWorkspace`）會在解析出的 **base cwd** 上建立或重用 worktree；因此正確指定 `projectWorkspaceId` 可讓 mono-repo 子目錄成為 worktree 的 repo 根。

## 操作建議

1. 在專案設定中新增多個 **Project workspaces**（名稱 + 本機路徑）。
2. 若需獨立議題目錄，在 **Execution workspaces** 區塊啟用 policy 並設定 branch 範本等。
3. 在議題側（新建或屬性）若專案有多個工作區，使用 **專案工作區** 選擇器綁定子目錄。

## 環境變數

Worktree provision 等指令執行時會帶入 `PAPERCLIP_WORKSPACE_*`、`PAPERCLIP_PROJECT_ID`、`PAPERCLIP_ISSUE_*` 等（見 `doc/DEVELOPING.md` 與 `workspace-runtime` 實作）。
