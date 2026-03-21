---
title: Governance Hub
summary: Company governance summary for approvals and issue links
---

Returns a consolidated view for the **Governance Hub** UI: pending approvals (including revision requested), recently approved hire and CEO-strategy decisions, and per-approval counts of linked issues (`issue_approvals`).

Payloads are redacted using the same rules as other approval APIs.

## Get governance summary

```
GET /api/companies/{companyId}/governance
```

**Auth:** Board session; company access enforced.

### Response

| Field | Type | Description |
|-------|------|-------------|
| `pendingApprovals` | array | Approvals with `status` `pending` or `revision_requested`, newest first. |
| `recentEnacted` | array | Approvals with `status` `approved` and `type` `hire_agent` or `approve_ceo_strategy`, ordered by `decidedAt` descending (up to 15). |

Each approval object matches the `Approval` shape plus:

| Field | Type | Description |
|-------|------|-------------|
| `linkedIssueCount` | number | Number of issues linked via `issue_approvals`. |

### Example

```json
{
  "pendingApprovals": [],
  "recentEnacted": [
    {
      "id": "…",
      "companyId": "…",
      "type": "approve_ceo_strategy",
      "status": "approved",
      "linkedIssueCount": 1,
      "payload": {},
      "decidedAt": "2025-03-01T12:00:00.000Z",
      "createdAt": "2025-03-01T11:00:00.000Z",
      "updatedAt": "2025-03-01T12:00:00.000Z"
    }
  ]
}
```
