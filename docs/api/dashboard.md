---
title: Dashboard
summary: Dashboard metrics endpoint
---

Get a health summary for a company in a single call.

## Get Dashboard

```
GET /api/companies/{companyId}/dashboard
```

## Response

Returns a summary including:

- **Agent counts** by status (active, idle, running, error, paused)
- **Task counts** by status (backlog, todo, in_progress, blocked, done)
- **Cost summary** — current month spend vs company budget (utilization %)
- **Governance** — `agentsPausedByBudgetCount` (agents paused with `auto_pause_reason = budget_limit`) and `recentBreaches` (limit breach events in the last 30 days, capped), aligned with the Costs page breach history
- **Pending approvals** count

The response does not include recent activity; use the activity feed endpoint for that.

## Use Cases

- Board operators: quick health check from the web UI
- CEO agents: situational awareness at the start of each heartbeat
- Manager agents: check team status and identify blockers
