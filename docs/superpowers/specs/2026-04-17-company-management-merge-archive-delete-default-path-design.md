# 公司管理頁整合：封存/刪除、Cleanup Orphans、預設公司路徑

**日期：** 2026-04-17  
**狀態：** 已確認設計（待實作）  
**範圍：** `paperclip-official/ui`（此站設定 / 公司管理）

---

## 1. 背景與問題

目前「此站設定」將以下能力拆成多個頁面與導覽入口：

- **公司管理**（`/instance/companies`）：列出公司、進入公司、手動指定方案期限等。
- **封存公司設定**（`/instance/archive-company`）：封存公司、永久刪除（需先封存）、Cleanup Orphans。
- **預設公司路徑**（`/instance/default-company-path`）：設定 `default_company_path`（影響未自訂 `working_directory` 的公司，其 Agent 設定目錄預設落在 `default_company_path/(companyId)`）。

這會造成管理者需要在多個頁面間切換，且側邊欄項目冗餘；同時「公司維運」相關操作在心智模型上應該集中在「公司」本身。

---

## 2. 目標

1. **移除**獨立頁面：**封存公司設定**、**預設公司路徑**（不再提供獨立內容頁）。
2. 將以下能力整合到 **公司管理**（`/instance/companies`）：
   - **封存公司**
   - **永久刪除公司**（僅限已封存；採同列二次確認）
   - **Cleanup Orphans**（維持既有確認與 toast 行為）
   - **此站預設公司路徑**（沿用既有 API 與儲存語意）
3. **降低導覽噪音**：從 `InstanceSidebar` 與 `InstanceSettings` 移除上述兩個舊入口。
4. **相容舊連結**：舊路由仍應可達，但 **自動導向**到公司管理，避免書籤/文件連結失效。

---

## 3. 非目標（刻意不做）

- 不改變後端 `default_company_path` 的資料模型與 API 契約（仍使用 `GET/PUT /api/instance/settings/default-company-path`）。
- 不改變封存/刪除/Cleanup Orphans 的後端端點與授權模型（沿用既有 `companiesApi.archive/remove/cleanupOrphans`）。
- 不重新設計「永久刪除」為輸入公司名稱的強確認（使用者選擇維持 **同列二次確認**）。

---

## 4. 使用者介面設計（IA + 互動）

### 4.1 路由與導覽

- **公司管理**：`/instance/companies`（主頁；整合後的唯一入口）
- **舊路由相容**：
  - `/instance/archive-company` → `Navigate` 到 `/instance/companies`（`replace`）
  - `/instance/default-company-path` → `Navigate` 到 `/instance/companies`（`replace`）
- **移除導覽入口**：
  - `InstanceSidebar`：移除「封存公司設定」「預設公司路徑」
  - `InstanceSettings`：移除對應卡片連結
  - `InstanceCompanyManagement`：移除導向封存頁的連結

### 4.2 公司管理頁版面（由上到下）

1. **頁首區（既有）**
   - 標題、描述
   - 「從模板新增公司」「新增空白公司」

2. **此站預設公司路徑（新卡片；位置：頁首下方）**
   - 文案沿用 `instance.defaultCompanyPath` / `instance.defaultCompanyPathDesc`
   - 表單行為沿用 `DefaultCompanyPathSettings`：
     - `GET` 載入後填入 input
     - `PUT` 儲存 `trim()` 後的值
     - **dirty 才能儲存**
     - 成功：toast `instance.defaultCompanyPathSaved` + invalidate `queryKeys.instanceSettings.defaultCompanyPath`
     - 失敗：toast error（沿用現有錯誤訊息策略）
   - **空字串儲存語意**：與後端一致，代表清除設定（刪除 instance setting row）。

3. **公司列表表格工具列（新區塊）**
   - 放置 **Cleanup Orphans** 按鈕（次要視覺）
   - 互動沿用 `ArchiveCompanySettings`：
     - `window.confirm(instance.cleanupOrphansConfirm)` 後才送出
     - 成功：`pushToast(instance.cleanupOrphansSuccess)`
     - 失敗：顯示可讀錯誤（沿用既有 banner/toast 策略之一；實作時以「最少驚喜」為準：與舊頁一致優先）

4. **公司列表表格（既有 + 擴充）**
   - **每列操作欄**在既有「設定方案」「進入公司」之外新增：
     - **封存**：`company.status !== "archived"` 時顯示（`paused/active` 皆可封存；狀態顯示規則維持後端回傳為準）
     - **永久刪除**：僅 `company.status === "archived"` 顯示
       - 第一次點擊進入 **同列確認態**（取消 / 確認）
       - 確認後呼叫 `companiesApi.remove(companyId)`
   - **提示**：非封存狀態若要刪除，維持「需先封存」提示（沿用 `instance.mustArchiveBeforeDelete` 的語意；呈現位置以不擠壓表格為準：可用 `title`、次要文字或折疊提示，實作時選最符合現有設計系統者）

### 4.3 錯誤處理與回饋

- **公司維運操作**（archive/remove/cleanup）：
  - 需要 **可見的錯誤匯聚區**（沿用舊頁 `actionError` banner 的模式），避免使用者不知道失敗原因。
  - 成功後 invalidate：
    - `queryKeys.companies.all`
    - `queryKeys.companies.stats`
    - （若影響側邊欄公司列表相關 query，則依現有 `CompanyContext` 的 refresh 機制補 invalidate；以實際程式碼為準）

### 4.4 權限與安全邊界

- 不新增新的權限模型；沿用既有「此站設定」頁面的可達性與後端授權。
- UI 仍必須假設後端可能拒絕：錯誤訊息以 API 回傳為主，並避免洩漏敏感資訊。

---

## 5. 工程變更範圍（預期檔案）

> 實作階段以實際相依為準；此處列出高機率修改點。

- `paperclip-official/ui/src/pages/InstanceCompanyManagement.tsx|.css`
- `paperclip-official/ui/src/App.tsx`（舊路由改 `Navigate`；移除舊頁 route 的 index element）
- `paperclip-official/ui/src/components/InstanceSidebar.tsx`
- `paperclip-official/ui/src/pages/InstanceSettings.tsx`
- 移除或停用：
  - `paperclip-official/ui/src/pages/ArchiveCompanySettings.tsx|.css`
  - `paperclip-official/ui/src/pages/DefaultCompanyPathSettings.tsx|.css`
- `paperclip-official/ui/src/locales/en.json` / `zh-TW.json`（若新增少量文案或調整描述字串）

---

## 6. 測試計畫

### 6.1 UI 層（優先）

- 路由相容：
  - 訪問 `/instance/archive-company` 與 `/instance/default-company-path` 會導向 `/instance/companies`
- 公司管理頁：
  - 顯示「此站預設公司路徑」卡片，且可觸發 save（mock API）
  - 表格工具列出現 Cleanup Orphans 入口（可視需求用 DOM/query 或 role 測試）

### 6.2 手動驗收（非自動化補強）

- 封存 → 列表狀態變更 → 永久刪除流程可用
- Cleanup Orphans 確認流程仍與舊頁一致
- 預設路徑儲存/清空行為與舊頁一致

---

## 7. 推出與相容性

- 對外文件若引用舊 URL，仍可用（會導向公司管理）。
- 若未來需要定位到頁面特定區塊（例如直接捲到「預設路徑」），可在實作階段追加 hash（本 spec 不強制）。

---

## 8. 決策紀錄（已與需求方確認）

1. **封存/刪除整合位置**：列表每列「操作」欄（最直接）。
2. **永久刪除確認**：同列二次確認（非 Dialog、非輸入公司名稱）。
3. **Cleanup Orphans 位置**：表格上方工具列。
4. **預設公司路徑**：移除獨立頁；整合為頁首下方獨立卡片（與列表分離）。
