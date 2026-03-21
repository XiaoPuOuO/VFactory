---
title: Companies
summary: Company CRUD endpoints
---

Manage companies within your Paperclip instance.

## List Companies

```
GET /api/companies
```

Returns all companies the current user/agent has access to.

## Get Company

```
GET /api/companies/{companyId}
```

Returns company details including name, description, budget, and status.

## Create Company

```
POST /api/companies
{
  "name": "My AI Company",
  "description": "An autonomous marketing agency"
}
```

## Update Company

```
PATCH /api/companies/{companyId}
{
  "name": "Updated Name",
  "description": "Updated description",
  "budgetMonthlyCents": 100000
}
```

## Archive Company

```
POST /api/companies/{companyId}/archive
```

Archives a company. Archived companies are hidden from default listings.

## Company Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Company name |
| `description` | string | Company description |
| `status` | string | `active`, `paused`, `archived` |
| `budgetMonthlyCents` | number | Monthly budget limit |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

## Company plugins (built-in)

Lists compile-time registered plugins and per-company state. Updating requires **company management** permission (`company:manage`).

```
GET /api/companies/{companyId}/plugins
```

Response:

```json
{
  "plugins": [
    {
      "id": "noop",
      "label": "No-op",
      "description": "…",
      "enabled": false,
      "config": {},
      "updatedAt": null
    }
  ]
}
```

```
PATCH /api/companies/{companyId}/plugins/{pluginId}
{
  "enabled": true,
  "config": {}
}
```

`pluginId` must be a member of `BUILTIN_PLUGIN_IDS` in `@paperclipai/shared`. See [`docs/plugins/built-in-plugins.md`](../plugins/built-in-plugins.md).

## Hire auto-approval policy

Delegated rules for `hire_agent` when the company still requires board approval for new agents (`requireBoardApprovalForNewAgents`): hires at or below a monthly budget cap can be auto-approved.

```
GET /api/companies/{companyId}/approval-policies/hire
```

```
PUT /api/companies/{companyId}/approval-policies/hire
{
  "enabled": true,
  "maxBudgetMonthlyCents": 50000
}
```

`PUT` requires company permission `governance:policies:manage` (owners always have it; `admin` role does not unless granted).
