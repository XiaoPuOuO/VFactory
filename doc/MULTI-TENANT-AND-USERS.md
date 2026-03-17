# 多租戶與帳號／使用者系統

本文說明 Paperclip 的多租戶（tenant）與帳號／使用者（user）的關係，以及請求如何取得「目前租戶」與「可存取的公司」。

---

## 一、兩層概念：Instance vs Tenant

| 層級 | 說明 | 主要資料表 |
|------|------|------------|
| **Instance（站點）** | 一整台 Paperclip 部署（例如 self-host 一台、SaaS 一個環境）。使用者帳號、instance 身分組、權限都屬於這一層。 | `user`（auth）、`instance_groups`、`instance_user_roles`、`instance_user_groups` |
| **Tenant（租戶）** | 站點底下的一個「工作區」。公司（companies）一定屬於某個租戶；使用者透過「租戶成員」取得在該租戶內可見的公司。 | `tenants`、`tenant_memberships`、`companies` |

- **一個 Instance** 底下有多個 **Tenants**。
- **一個 User** 可以屬於多個 Tenants（透過 `tenant_memberships`），在每個租戶內再透過 `company_memberships` 屬於多間公司。

---

## 二、資料結構關係

```
┌─────────────────────────────────────────────────────────────────┐
│  Instance（站點）                                                 │
│  ┌──────────────┐    ┌─────────────────────┐                     │
│  │ user         │    │ instance_groups     │                     │
│  │ (auth)       │    │ instance_user_roles │  → 決定 instance 權限 │
│  │ id, group…   │    │ instance_user_groups│    （如 company.create）│
│  └──────┬───────┘    └─────────────────────┘                     │
│         │                                                         │
│         │  userId                                                  │
│         ▼                                                         │
│  ┌──────────────────────┐      ┌─────────────┐                  │
│  │ tenant_memberships    │──────▶│ tenants     │                  │
│  │ (userId, tenantId,   │      │ id, slug,   │                  │
│  │  role: owner/admin/  │      │ name       │                  │
│  │  member)             │      └──────┬──────┘                  │
│  └──────────────────────┘             │                         │
│         │                               │ tenantId                │
│         │ 決定「此 user 屬於哪些租戶」    ▼                         │
│         │                      ┌─────────────────┐                 │
│         │                      │ companies      │                 │
│         │                      │ (tenantId,     │                 │
│         │                      │  name, …)      │                 │
│         │                      └────────┬───────┘                 │
│         │                               │ companyId              │
│         ▼                               ▼                         │
│  ┌──────────────────────┐      ┌─────────────────────┐          │
│  │ company_memberships  │──────│ 可存取的 company 列表 │          │
│  │ (companyId,          │      │ = 依 req.tenantId    │          │
│  │  principalType=user, │      │   過濾後的 companyIds│          │
│  │  principalId=userId) │      └─────────────────────┘          │
│  └──────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

- **User**：登入帳號，存在 `user`（auth），有 `id`、可選的 `group`（對應 instance 身分組）。
- **Tenant**：工作區，有 `slug`（如 `default`、`acme`）、`name`。
- **tenant_memberships**：某 user 屬於某 tenant，角色為 owner / admin / member。
- **companies**：每間公司必屬一個 tenant（`tenant_id`），同一 tenant 內 `issue_prefix` 唯一。
- **company_memberships**：某 user（或 agent）是某公司的成員；用來算「此 user 可存取的 company 清單」。

---

## 三、請求流程：如何得到「目前租戶」與「可存取公司」

### 3.1 請求進入順序（middleware）

1. **tenantResolutionMiddleware**  
   - 只看 request header：`X-Tenant-ID` 或 `X-Tenant-Slug`。  
   - 若有帶：依 ID 或 slug 查出 `tenants`，設定 `req.tenantId`、`req.tenantSlug`。  
   - 若沒帶：**不設定** `req.tenantId`（不假設 default），交給後面需要 tenant 的 API 回錯，前端再導向租戶選擇。

2. **actorMiddleware**  
   - 辨識是誰在打 API（session → board user，或 Bearer → agent）。  
   - 若是 **board user**：  
     - 查 `company_memberships`（principalType=user, principalId=userId）得到「該 user 在所有租戶底下的公司」`companyIds`。  
     - 若有 **req.tenantId**：只保留「屬於此 tenant 的公司」；若 user 不是此 tenant 的成員且也沒有 instance 權限，則 `companyIds = []`。  
   - 最後寫入 `req.actor`（例如 `type: "board"`, `userId`, `companyIds`, `permissions`）。

因此：

- **目前租戶** = 前端傳的 `X-Tenant-Slug`（或 ID）對應的那個 tenant，僅此一個。  
- **可存取公司** = 在「目前租戶」內、且該 user 在 `company_memberships` 有紀錄的公司（或 instance 權限放行）。

### 3.2 前端如何帶「目前租戶」

- 使用者登入後，若尚未選租戶，會先被導向 **租戶選擇頁**（`/tenant-select`）。  
- 前端呼叫 `GET /api/tenants/me`（不需 tenant header），依 **目前登入 user** 回傳其 `tenant_memberships` 對應的租戶列表。  
- 使用者選一個租戶（或只有一個時自動選），前端把該租戶的 `slug` 存到 localStorage（`paperclip.tenantSlug`），之後每個 API 請求都帶 **`X-Tenant-Slug: <slug>`**。  
- 因此「目前租戶」完全由**使用者在 UI 的選擇**決定，不會強制 default。

---

## 四、一 User 一 Tenant（固定）

系統**固定**為 **一 User 一 Tenant**：每個使用者帳號對應唯一一個租戶，不支援一帳號多租戶。

- **唯一對應**：每個 user 的「自己的租戶」由 slug 決定，slug = `u-` + userId 正規化（僅保留 `[a-z0-9-]`）。同一 userId 永遠對應同一個 slug，API 只回傳該筆。
- **首次使用**：呼叫 `GET /api/tenants/me` 時若尚無該 slug 的租戶，會自動建立一筆（name 為 "My Workspace"）、並將該 user 加入為 **owner**，再回傳。之後一律只回傳這一個。
- **舊資料**：若 DB 中該 user 曾有多筆租戶（例如舊的 default），API 只認 slug 對應該 user 的那一筆；其餘不回傳，也不提供多租戶選擇。
- **前端**：租戶選擇頁只做「帶入唯一租戶並導向」，不再顯示多租戶列表。

---

## 五、帳號與租戶的關係（摘要）

| 問題 | 說明 |
|------|------|
| 一個帳號可以屬於幾個租戶？ | **固定一個**。每個 user 對應唯一租戶（slug 由 userId 衍生）；`GET /api/tenants/me` 永遠回傳一筆。 |
| 同一個帳號在不同租戶看到的公司？ | 只會看到「該租戶內」且自己在 `company_memberships` 有紀錄的公司。一帳號一租戶時通常只有一個租戶。 |
| 建立公司會建在哪個租戶？ | 建在 **request 當時的 req.tenantId**，也就是前端送的 `X-Tenant-Slug` 對應的租戶。一帳號一租戶時就是建在自己的那一個租戶。 |
| Default tenant 是什麼？ | 只是一個 slug 為 `default` 的租戶。若有人**明確**送 `X-Tenant-Slug: default` 且該租戶不存在，middleware 可選擇自動建立；未帶 header 時不會再自動套用 default。 |
| Instance 權限（如 company.create）與租戶的關係？ | Instance 權限（身分組）決定「能不能做某動作」；租戶只決定「在哪個工作區做」。例如：有權限建立公司 + 目前選了租戶 A → 新公司會建在租戶 A。 |

---

## 六、相關檔案（含一帳號一租戶邏輯）

- **Schema**：`packages/db/src/schema/tenants.ts`、`tenant_memberships.ts`、`companies.ts`、`company_memberships.ts`、`auth.ts`、`instance_user_roles.ts`  
- **租戶解析**：`server/src/middleware/tenant-resolution.ts`  
- **Actor 與 companyIds 過濾**：`server/src/middleware/auth.ts`  
- **租戶 API 與一帳號一租戶**：`server/src/routes/tenants.ts`（`GET /api/tenant`、`GET /api/tenants/me` 內含 `ensureUserTenant`）  
- **前端**：`ui/src/api/client.ts`（X-Tenant-Slug）、`ui/src/pages/TenantSelect.tsx`、`ui/src/App.tsx`（未選租戶時導向 tenant-select）
