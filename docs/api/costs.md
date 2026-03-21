---
title: Costs
summary: Cost events, summaries, and budget management
---

Track token usage and spending across agents, projects, and the company.

## Report Cost Event

```
POST /api/companies/{companyId}/cost-events
{
  "agentId": "{agentId}",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "inputTokens": 15000,
  "outputTokens": 3000,
  "costCents": 12
}
```

Typically reported automatically by adapters after each heartbeat.

## Company Cost Summary

```
GET /api/companies/{companyId}/costs/summary
```

Optional query: `from`, `to` (ISO date strings) to restrict the range. Default is current month.

Returns:

- `companyId`, `spendCents`, `budgetCents`, `utilizationPercent`
- `tokenUsage` (optional) — total input + output tokens in the range
- `tokenLimit` (optional) — company token limit if set
- `priceLimitCents` (optional) — company price limit in cents if set
- `breachEvents` (optional) — array of limit breach events in the last 90 days. Each has: `id`, `companyId`, `type` (`budget_breach` | `token_limit_breach` | `price_limit_breach` | `budget_policy_breach`), `occurredAt`, `amountCents`, `tokenUsage`, `agentId`, `details`, `createdAt`.

## Budget policies (multi-dimensional)

List (requires company access), create/update/delete (board + `budgets:manage`):

```
GET /api/companies/{companyId}/budget-policies
POST /api/companies/{companyId}/budget-policies
PATCH /api/companies/{companyId}/budget-policies/{policyId}
DELETE /api/companies/{companyId}/budget-policies/{policyId}
```

Create body (example — project scope):

```json
{
  "scopeType": "project",
  "projectId": "{uuid}",
  "limitCents": 50000,
  "onExceed": "block_new_runs_for_scope"
}
```

`scopeType`: `project` | `billing_code` | `company`. For `billing_code`, set `billingCode` (non-empty). For `company`, omit `projectId` and `billingCode`. At most one enabled policy per scope key (enforced by partial unique indexes).

`onExceed`: `record_only` (log breach only), `block_new_runs_for_scope` (block new runs when over limit for that scope), `pause_agents` (pause the agent that caused the first over-limit event in the month).

## Costs by Agent

```
GET /api/companies/{companyId}/costs/by-agent
```

Returns per-agent cost breakdown for the current month.

## Costs by Project

```
GET /api/companies/{companyId}/costs/by-project
```

Returns per-project cost breakdown for the current month.

## Budget Management

### Set Company Budget

```
PATCH /api/companies/{companyId}
{ "budgetMonthlyCents": 100000 }
```

### Set Agent Budget

```
PATCH /api/agents/{agentId}
{ "budgetMonthlyCents": 5000 }
```

### Set Company Token and Price Limits

```
PATCH /api/companies/{companyId}/limits
{ "tokenLimit": 1000000, "priceLimitCents": 50000 }
```

Provide at least one of `tokenLimit` or `priceLimitCents`. Use `null` to clear a limit. When either limit is exceeded for the current month, new runs are blocked (existing runs continue); creating issues is still allowed but they do not run.

## Budget Enforcement

| Threshold | Effect |
|-----------|--------|
| 80% | Soft alert — agent should focus on critical tasks |
| 100% | Hard stop — agent is auto-paused |

Budget windows reset on the first of each month (UTC).
