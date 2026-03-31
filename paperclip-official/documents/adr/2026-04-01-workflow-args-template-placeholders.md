# ADR：工作流程參數（arg）與模板佔位符 `{{variable_name}}`

日期：2026-04-01

## 背景

- 工作流程技能在 YAML `arguments` 中定義參數；每個參數的 `name` 即為模板與執行期 context 中的**變數鍵**，以 `{{name}}` 取代。
- 可選欄位 `label` 僅供人類可讀顯示（表單／說明），不參與解析。
- 內建 context 鍵亦可在模板中使用：`companyId`、`agentId`、`skillName`。
- 流程步驟若宣告 `output: some_key`，後續步驟可使用 `{{some_key}}`（由引擎寫入 context）。

## 聊天觸發：位置參數（寫死規則）

實作位置：`server/src/services/skill-invocation-parser.ts`。

- 僅處理**整行**符合下列型式的行（行首可空白）：
  - 正則：`^\s*\/([A-Za-z0-9_-]{1,64})(?:\s+(.*?))?\s*$`
  - 技能名稱會正規化為 **kebab-case**（小寫、`_` → `-`），故 `/game_delivery_pipeline` 與 `/game-delivery-pipeline` 視為同一技能鍵。
- 技能名稱之後為參數字串；以 `ARG_TOKEN_RE` 擷取 token：
  - 雙引號或單引號包覆的字串為一個 token（含簡易反斜線跳脫）；
  - 其餘以**空白**分隔為多個 token。
- **位置對應**：`arguments` 陣列**依宣告順序**對應；第 *i* 個 token 填入第 *i* 個參數定義的 `name` 所代表的變數（`resolveSkillValuesForWorkflow`，`server/src/services/skill-injection.ts`）。
- 限制：每則訊息最多 8 次 invocation、每次最多 16 個 token、單一 token 最長 256 字元（與現行程式一致）。

### 範例

- `/game-delivery-pipeline 專案A`  
  - 第一個位置參數 → 第一個 `arguments` 條目（若其 `name: project_name`）→ context 與模板中 `{{project_name}}` 替換為 `專案A`。
- `/game-delivery-pipeline "My Project"`  
  - 單一 token `My Project`（含空白）寫入 `project_name`。

## 儲存與執行驗證

- `packages/shared/src/workflow-template-validation.ts`：`validateWorkflowFrontmatterTemplatePlaceholders` 掃描 `prompt`、各 flow 步驟之 `template`、`message`、`condition`、`params` 值、`invoke_workflow.args` 等字串，確保每個 `{{...}}` 中的名稱皆已註冊（內建鍵、`arguments[].name`、各步驟 `output`、`loop.item_as`）。
- Zod 嚴格解析（`skillFrontmatterSchema`）與 workflow `startRun` 均會拒絕未定義佔位符，避免執行期靜默失敗。

## 範本遷移

- 內建範本 `game_update_qa_deploy`（`game-delivery-pipeline`）已將 `game_title` 改為 **`project_name`**，並設定 `label: 目標專案名稱`。
