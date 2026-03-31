/**
 * 內建工作流程範本（原始 Markdown 片段），供精靈／範本庫使用。
 */
export type WorkflowTemplateDef = {
  id: string;
  markdown: string;
};

export const WORKFLOW_TEMPLATE_IDS = [
  "customer_support",
  "weekly_report",
  "onboarding",
  "code_review_sop",
  "automated_testing",
  "bug_fix_pipeline",
  "game_update_qa_deploy",
] as const;

export function getWorkflowTemplates(): WorkflowTemplateDef[] {
  return [
    {
      id: "customer_support",
      markdown: `---
name: support-reply-style
description: 客服回覆語氣與結構規範
mode: passive
---
# 補充說明

- 保持專業、簡潔
- 先確認問題再給解法`,
    },
    {
      id: "weekly_report",
      markdown: `---
name: weekly-report
description: 每週工作彙報流程
mode: active
trigger:
  on: manual
---
請根據本週議題與目標進度，產出簡短週報（重點三則、阻礙一則、下週計畫）。`,
    },
    {
      id: "onboarding",
      markdown: `---
name: client-onboarding
description: 新客戶入職檢查清單
mode: active
---
你是入職協調助理。請依 {{client_name}} 的方案等級，列出需要完成的設定步驟與負責人。`,
    },
    {
      id: "code_review_sop",
      markdown: `---
name: code-review-sop
description: 大型美商級 PR 審查 SOP（正確性、設計、屎山／技術債、資安、測試、效能與可觀測性等；可被 invoke_workflow 嵌套）
mode: active
trigger:
  on: manual
flow:
  - kind: prompt
    id: cr-scope
    name: 範圍與意圖
    template: |
      請閱讀 PR／變更說明與 diff 摘要，釐清：變更目的、影響模組與使用者／資料面、是否為破壞性變更、與設計文件／議題是否一致。條列「必須看過的檔案／區塊」。
    output: cr_scope
  - kind: prompt
    id: cr-correct
    name: 正確性與邊界
    template: |
      參考：{{cr_scope}}
      審查邏輯正確性：邊界條件、錯誤路徑、併發／競態、數值與時區、向後相容。指出具體行號或符號與疑慮。
    depends_on: [cr-scope]
    output: cr_correctness
  - kind: prompt
    id: cr-design
    name: 設計與可維護性
    template: |
      參考：{{cr_correctness}}
      從設計角度檢視：模組邊界、抽象層次、API 可讀性與擴展點、是否過度設計或責任不清、與既有架構是否一致。若需重構，請區分「建議」與「合併前必改」。
    depends_on: [cr-correct]
    output: cr_design
  - kind: prompt
    id: cr-legacy
    name: 屎山與技術債
    template: |
      參考：{{cr_design}}
      進行「屎山／歷史債」審查：是否在既有高耦合、欠缺測試或暫時 workaround 上疊加變更；是否新增難以理解的捷徑、魔法數字、無註解的 hack；是否加重技術債或提供縮減債務的機會。若變更無法避免碰觸髒程式，請說明風險與後續償還建議。
    depends_on: [cr-design]
    output: cr_legacy
  - kind: prompt
    id: cr-sec
    name: 資安與隱私
    template: |
      參考：{{cr_legacy}}
      進行資安與隱私審查：輸入驗證、注入（SQL／XSS／命令）、權限與身分驗證、敏感資料處理與日誌脫敏、相依套件與供應鏈、密鑰／設定是否誤提交。對照 OWASP 常見類別，標註嚴重度（阻擋／建議／資訊）。
    depends_on: [cr-legacy]
    output: cr_security
  - kind: prompt
    id: cr-test
    name: 測試與品質門檻
    template: |
      參考：{{cr_security}}
      審查測試覆蓋意義（非單純數字）：單元／整合／E2E 是否涵蓋關鍵路徑；型別與靜態檢查；CI 是否足夠；若缺測試，請明確說明需補的場景與優先級。
    depends_on: [cr-sec]
    output: cr_testing
  - kind: prompt
    id: cr-perf
    name: 效能與可觀測性
    template: |
      參考：{{cr_testing}}
      檢視效能與可維運性：演算法與複雜度、I/O 與快取、N+1、記憶體與配置；可觀測性（日誌、指標、追蹤、錯誤邊界）；若為前端，簡述可及性／效能對使用者體驗的影響（可選）。
    depends_on: [cr-test]
    output: cr_perf_obs
  - kind: prompt
    id: cr-verdict
    name: 審查結論
    template: |
      彙整前序各項輸出（範圍、正確性、設計、屎山／技術債、資安、測試、效能與可觀測性），請給出：
      1) 總結評語（LGTM／需修改／建議阻擋合併）
      2) 必須在合併前處理的項目（blocking）
      3) 建議後續跟進（non-blocking）
      4) 殘餘風險與建議的額外驗證（手動或自動）
    depends_on: [cr-perf]
    output: cr_result
---
# 程式碼審查 SOP（大型美商風格）

參考一線科技公司常見 PR 審查面向：正確性、設計、**屎山／技術債**、**資安與隱私**、測試、效能與可觀測性，最後產出結論。

此技能可被「修復 Bug」等父流程以 \`invoke_workflow\` 呼叫；請維持 \`name: code-review-sop\` 與父流程中的 \`skill_key\` 一致。`,
    },
    {
      id: "automated_testing",
      markdown: `---
name: automated-testing-sop
description: 依專案類型執行測試（Web 建議 browser-use；其餘語言撰寫一次性腳本，通過後刪除）
mode: active
trigger:
  on: manual
flow:
  - kind: prompt
    id: at-probe
    name: 專案類型
    template: |
      請閱讀 repo（package.json、README、目錄結構），判斷是否為需以瀏覽器驗證的 Web 專案。
      僅輸出單一行：WEB 或 OTHER（請使用全大寫英文）。
    output: stack_kind
  - kind: condition
    id: at-br
    name: Web 分支
    condition: "{{stack_kind}} contains 'WEB'"
    if_true: at-web
    if_false: at-other
    depends_on: [at-probe]
  - kind: prompt
    id: at-web
    name: Web 測試
    template: |
      請使用 browser-use（或團隊約定之瀏覽器／E2E 工具）驗證主要使用者路徑；記錄操作步驟、觀察結果與是否通過。
    depends_on: [at-br]
    output: web_test_result
  - kind: prompt
    id: at-other
    name: 腳本測試
    template: |
      依專案語言與測試慣例撰寫**一次性**測試腳本、執行並確認通過後，**刪除該腳本檔**，並在輸出中說明已刪除的路徑與驗證結果摘要。
    depends_on: [at-br]
    output: script_test_result
---
# 自動化測試 SOP

父流程中的 \`skill_key\` 須為 \`automated-testing-sop\`（與本技能 \`name\` 一致）。`,
    },
    {
      id: "bug_fix_pipeline",
      markdown: `---
name: bug-fix-pipeline
description: 從錯誤日誌、修復、嵌套審查與測試 SOP，到 Git 提交的完整流程
mode: active
trigger:
  on: manual
flow:
  - kind: prompt
    id: bf-err
    name: 錯誤與日誌
    template: |
      請蒐集並整理：錯誤訊息、堆疊、重現步驟、相關檔案／設定與環境。將可操作的摘要寫入輸出。
    output: error_log
  - kind: prompt
    id: bf-fix
    name: 修復
    template: |
      依據下列資訊修正問題，並說明根因、變更重點與風險：
      {{error_log}}
    depends_on: [bf-err]
    output: fix_summary
  - kind: invoke_workflow
    id: bf-invoke-cr
    name: 執行程式碼審查 SOP
    skill_key: code-review-sop
    output: cr_invoke
    depends_on: [bf-fix]
  - kind: invoke_workflow
    id: bf-invoke-test
    name: 執行測試 SOP
    skill_key: automated-testing-sop
    output: test_invoke
    depends_on: [bf-invoke-cr]
  - kind: prompt
    id: bf-commit
    name: Git 提交
    template: |
      修復、審查與測試摘要已於前序步驟完成（含嵌套流程寫入之 cr_invoke、test_invoke）。
      請確認無誤後執行：git add、git commit（訊息清楚描述問題與修正），並視需要註明是否需開 PR／標籤審核人。
    depends_on: [bf-invoke-test]
    output: git_result
---
# 修復 Bug 全流程

**使用前請先**在公司技能庫建立並儲存 \`code-review-sop\` 與 \`automated-testing-sop\` 兩個工作流程（可自範本「程式碼審查 SOP」「自動化測試」建立），否則 \`invoke_workflow\` 將無法解析子流程。`,
    },
    {
      id: "game_update_qa_deploy",
      markdown: `---
name: game-delivery-pipeline
description: 遊戲專案更新：新增 5 個關卡、設計一把新武器並做平衡；完成後以 browser-use 自動驗證關卡與武器，通過則部署，失敗則修復再驗
mode: active
trigger:
  on: manual
arguments:
  - name: project_name
    label: 目標專案名稱
    type: string
    description: 觸發時第一個位置參數會寫入此變數（模板 {{project_name}}）；可選。
    required: false
flow:
  - kind: prompt
    id: gu-spec
    name: 關卡與武器設計
    template: |
      目標專案：{{project_name}}（若未填則以目前工作區／repo 為準）。
      請產出**可交付的設計摘要**（Markdown），至少包含：
      1) **五個新關卡**：每關名稱、核心玩法機制、難度曲線、勝利／失敗條件、與既有關卡的銜接。
      2) **一把新武器**：定位（近戰／遠程／支援等）、操作與手感、預期數值範圍（傷害、冷卻、資源消耗等）。
      3) **平衡設計**：與既有至少 3 把代表性武器的對照表（例如 DPS、TTK、冷卻、彈藥或能量、風險／回報），並說明如何避免破壞既有 meta。
      若資訊不足，請先列出假設與待確認問題。
    output: gu_design_doc
  - kind: prompt
    id: gu-build
    name: 實作與變更
    template: |
      依下列設計在**目前 checkout 的 repo／工作區**實作（或若無法直接改碼，請列出具體檔案路徑與 PR 任務清單）：
      {{gu_design_doc}}
      請說明實際修改的檔案、關鍵邏輯與如何對照設計驗收。
    depends_on: [gu-spec]
    output: gu_impl_summary
  - kind: prompt
    id: gu-browser
    name: Browser-use 自動驗證
    template: |
      實作摘要如下（請據此驗證「五關可玩」與「新武器可用且合理」）：
      {{gu_impl_summary}}
      請使用 **browser-use**（或團隊約定、已整合之瀏覽器自動化）對**建置後可存取之遊戲 URL／本機 URL** 執行：
      - 依序或抽樣進入新關卡，確認可載入、可完成核心目標、無阻擋性錯誤。
      - 取得並裝備新武器，確認攻擊／技能動畫與數值表現與設計一致、無崩潰。
      請記錄步驟、截圖或日誌要點，並在**輸出結尾單獨一行**寫入：
      \`QA_STATUS: PASS\` 或 \`QA_STATUS: FAIL\`（失敗時附簡短原因）。
    depends_on: [gu-build]
    output: qa_report
  - kind: condition
    id: gu-gate
    name: 測試是否通過
    condition: "{{qa_report}} contains 'QA_STATUS: PASS'"
    if_true: gu-deploy
    if_false: gu-fix
    depends_on: [gu-browser]
  - kind: prompt
    id: gu-deploy
    name: 部署
    template: |
      自動化測試已通過（\`QA_STATUS: PASS\`）。請依團隊規範執行部署或產出部署檢查清單，例如：
      - 確認建置產物、環境變數、版本號與 rollback 方式；
      - 若需 CI／CD 指令，請寫出實際可執行命令（勿臆測不存在的 pipeline）。
      最後請給董事長一句話摘要：已部署／待誰批准／何時上線。
    depends_on: [gu-gate]
    output: deploy_summary
  - kind: prompt
    id: gu-fix
    name: 修復並重測
    template: |
      測試未通過。請根據下列報告**先修復程式或內容**，然後**再次**使用 browser-use 跑與上一關相同範圍的驗證（五關＋新武器）。
      {{qa_report}}
      修復後請在輸出結尾**單獨一行**寫入 \`QA_STATUS: PASS\` 或 \`QA_STATUS: FAIL\`。若已通過，請補上部署建議；若仍失敗，請列出剩餘阻擋問題與建議人工介入點。
    depends_on: [gu-gate]
    output: fix_and_retest
---
# 遊戲更新 → 自動化 QA → 部署

適用：**關卡型遊戲／武器系統**之內容與平衡更新。執行者需能操作目標 repo 與（可選）browser-use 服務。

**注意**：分支 \`gu-fix\` 完成後若仍為 \`FAIL\`，請在對話中再開一輪 workflow 或手動追蹤；本範本以單次修復步驟呈現，避免流程圖循環。`,
    },
  ];
}
