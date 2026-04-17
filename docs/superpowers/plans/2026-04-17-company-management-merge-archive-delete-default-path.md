# 公司管理頁整合（封存/刪除、Cleanup、預設公司路徑）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 `/instance/archive-company` 與 `/instance/default-company-path` 的獨立內容頁，將能力整合到 `/instance/companies`，並保留舊 URL 的 redirect 相容。

**Architecture:** 以 `InstanceCompanyManagement` 為單一「公司維運」入口：頁首下方面卡片編輯 instance setting；表格工具列提供 cleanup；每列操作欄提供 archive/remove（remove 需先 archive + 同列二次確認）。路由層用 `Navigate` 將舊路徑導向新公司管理頁。

**Tech Stack:** React 19、react-router-dom（專案封裝 `@/lib/router`）、TanStack Query、i18next、Vitest（`paperclip-official/ui`）

---

### Task 1: 路由相容與移除舊頁元件引用

**Files:**
- Modify: `paperclip-official/ui/src/App.tsx`
- Delete: `paperclip-official/ui/src/pages/ArchiveCompanySettings.tsx`
- Delete: `paperclip-official/ui/src/pages/ArchiveCompanySettings.css`
- Delete: `paperclip-official/ui/src/pages/DefaultCompanyPathSettings.tsx`
- Delete: `paperclip-official/ui/src/pages/DefaultCompanyPathSettings.css`
- Test: `paperclip-official/ui/src/__tests__/instance-company-management-routes.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("instance company management route consolidation", () => {
  it("redirects legacy instance settings routes to /instance/companies", () => {
    const appTsxPath = path.join(process.cwd(), "src", "App.tsx");
    const source = fs.readFileSync(appTsxPath, "utf8");

    expect(source).toContain('path="instance/default-company-path"');
    expect(source).toContain('path="instance/archive-company"');
    expect(source).toContain('<Navigate to="/instance/companies" replace />');

    expect(source).not.toContain("DefaultCompanyPathSettings");
    expect(source).not.toContain("ArchiveCompanySettings");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd paperclip-official/ui
pnpm exec vitest run src/__tests__/instance-company-management-routes.test.ts
```

Expected（修改前）: FAIL（找不到 Navigate 或仍包含舊元件名稱）

- [x] **Step 3: Write minimal implementation**

1. 移除 `App.tsx` 對 `DefaultCompanyPathSettings` / `ArchiveCompanySettings` 的 import
2. 將兩個 route 的 `index element` 改成：

```tsx
<Route index element={<Navigate to="/instance/companies" replace />} />
```

3. 刪除兩個舊 page 檔案（`.tsx` + `.css`）

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
cd paperclip-official/ui
pnpm exec vitest run src/__tests__/instance-company-management-routes.test.ts
```

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add paperclip-official/ui/src/App.tsx \
  paperclip-official/ui/src/pages/ArchiveCompanySettings.tsx \
  paperclip-official/ui/src/pages/ArchiveCompanySettings.css \
  paperclip-official/ui/src/pages/DefaultCompanyPathSettings.tsx \
  paperclip-official/ui/src/pages/DefaultCompanyPathSettings.css \
  paperclip-official/ui/src/__tests__/instance-company-management-routes.test.ts
git commit -m "feat(ui): 合併舊此站設定路由至公司管理"
```

---

### Task 2: 更新此站設定導覽入口（移除重複頁）

**Files:**
- Modify: `paperclip-official/ui/src/components/InstanceSidebar.tsx`
- Modify: `paperclip-official/ui/src/pages/InstanceSettings.tsx`

- [x] **Step 1: Remove sidebar items**
  - 刪除 `/instance/default-company-path`
  - 刪除 `/instance/archive-company`

- [x] **Step 2: Remove InstanceSettings cards**
  - 刪除兩張對應卡片與不再使用的 icon import

- [x] **Step 3: Run UI typecheck**

```bash
cd paperclip-official/ui
pnpm typecheck
```

Expected: PASS

- [x] **Step 4: Commit**

```bash
git add paperclip-official/ui/src/components/InstanceSidebar.tsx \
  paperclip-official/ui/src/pages/InstanceSettings.tsx
git commit -m "fix(ui): 移除此站設定中已整合的公司維運入口"
```

---

### Task 3: 整合 UI 到公司管理頁

**Files:**
- Modify: `paperclip-official/ui/src/pages/InstanceCompanyManagement.tsx`
- Modify: `paperclip-official/ui/src/pages/InstanceCompanyManagement.css`
- Modify: `paperclip-official/ui/src/locales/zh-TW.json`
- Modify: `paperclip-official/ui/src/locales/en.json`

- [x] **Step 1: Default company path card（instance setting）**
  - 複用 `DefaultCompanyPathSettings` 的行為：
    - `useQuery(queryKeys.instanceSettings.defaultCompanyPath)`
    - `useMutation(instanceSettingsApi.setDefaultCompanyPath)`
    - dirty 才能儲存、成功 toast、錯誤 toast

- [x] **Step 2: Table toolbar cleanup**
  - `window.confirm` + `companiesApi.cleanupOrphans`
  - 成功 toast + invalidate companies queries

- [x] **Step 3: Per-row archive/remove**
  - `companiesApi.archive`（非 archived）
  - `companiesApi.remove`（僅 archived；同列二次確認）
  - `actionError` banner（與舊頁一致）

- [x] **Step 4: i18n**
  - 更新 `instance.companyManagementDesc`（中/英同步）

- [x] **Step 5: Run tests + typecheck**

```bash
cd paperclip-official/ui
pnpm exec vitest run
pnpm typecheck
```

Expected: PASS

- [x] **Step 6: Commit**

```bash
git add paperclip-official/ui/src/pages/InstanceCompanyManagement.tsx \
  paperclip-official/ui/src/pages/InstanceCompanyManagement.css \
  paperclip-official/ui/src/locales/zh-TW.json \
  paperclip-official/ui/src/locales/en.json
git commit -m "feat(ui): 公司管理頁整合預設路徑與封存刪除"
```

---

### Task 4: 文件同步（inventory）

**Files:**
- Modify: `paperclip-official/documents/ui-commercial-upgrade-inventory.md`

- [x] **Step 1: Update public routes table**
  - `/instance/default-company-path`、`/instance/archive-company` 改為 redirect
  - `/instance/companies` 描述補上整合範圍

- [x] **Step 2: Commit**

```bash
git add paperclip-official/documents/ui-commercial-upgrade-inventory.md
git commit -m "docs: 更新公開路由盤點（公司管理整合）"
```

---

### Task 5: docs ignore 規則（讓 superpowers plans/specs 可追蹤）

**Files:**
- Modify: `.gitignore`

- [x] **Step 1: Allowlist**
  - `docs/**` 預設忽略
  - `!docs/superpowers/specs/**`
  - `!docs/superpowers/plans/**`

- [x] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: 允許追蹤 docs/superpowers 規格與計畫"
```

---

## Self-review（對照 spec）

- Spec 要求的三個整合點（預設路徑卡片、cleanup 工具列、每列封存/刪除）皆有對應 Task。
- 舊路由相容與移除導覽入口已涵蓋。
- 測試：至少鎖定 `App.tsx` 的 redirect 與移除舊元件字串，避免回歸。
