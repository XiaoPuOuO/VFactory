---
title: Goals and Projects
summary: Goal hierarchy and project management
---

Goals define the "why" and projects define the "what" for organizing work.

## Goals

Goals form a hierarchy: company goals break down into team goals, which break down into agent-level goals.

### List Goals

```
GET /api/companies/{companyId}/goals
```

### Get Goal

```
GET /api/goals/{goalId}
```

### Goal progress

Aggregates issue status counts and spend for a goal and its linked projects (same project linkage as the goal detail UI: `projects.goal_id`, or `project_goals`). Cost total sums `cost_events` rows attributed to the goal, to a linked project, or to an issue in scope (each row counted once). Optional query: `from`, `to` (ISO 8601) to filter costs by `occurred_at`; omit both for all-time costs.

```
GET /api/goals/{goalId}/progress?from={iso}&to={iso}
```

Response shape (TypeScript names): `GoalProgress` in `@paperclipai/shared` — includes `issueStatusCounts`, `spendCents`, `inputTokens`, `outputTokens`, `projects` (per-project issue counts and project-attributed spend), and `childGoals`.

### Create Goal

```
POST /api/companies/{companyId}/goals
{
  "title": "Launch MVP by Q1",
  "description": "Ship minimum viable product",
  "level": "company",
  "status": "active",
  "recurrence": "one_time"
}
```

- **recurrence**: `one_time` (default) | `daily` | `weekly` | `monthly` | `custom`. One-time goals are marked **achieved** when all linked issues are done/cancelled. Recurring goals do not auto-achieve; when all linked issues are done, the system sets **recurrence_next_refresh_at** = now + interval, and the goal is considered "waiting for refresh" until that time.
- **Custom recurrence**: when `recurrence` is `custom`, send **recurrenceIntervalDays** (0–365), **recurrenceIntervalHours** (0–23), **recurrenceIntervalMinutes** (0–59), **recurrenceIntervalSeconds** (0–59). At least one must be &gt; 0. Example: every 2 days 3 hours = `recurrenceIntervalDays: 2`, `recurrenceIntervalHours: 3`, minutes/seconds 0.
- **recurrence_next_refresh_at** (read-only): for recurring goals, the next time the goal is considered "active" again (has work). Heartbeat skip logic treats a goal as having no work when `now < recurrence_next_refresh_at`.

### Update Goal

```
PATCH /api/goals/{goalId}
{
  "status": "achieved",
  "description": "Updated description",
  "recurrence": "weekly"
}
```

When setting `recurrence` to `custom`, include the four interval fields; they cannot all be zero.

### Auto-achieve and recurring refresh

When an issue is set to **done** and it is linked to a goal (`goalId`):

- If the goal has **recurrence** `one_time` and all linked issues are done/cancelled, the goal is updated to **status** `achieved`.
- If the goal has **recurrence** `daily` | `weekly` | `monthly` | `custom` and all linked issues are done/cancelled, the goal is not achieved; instead **recurrence_next_refresh_at** is set to *now* + the goal’s interval (e.g. daily = +1 day). Until `now >= recurrence_next_refresh_at`, the goal is treated as "waiting for refresh" (no work) for heartbeat timer skip logic.

## Projects

Projects group related issues toward a deliverable. They can be linked to goals and have workspaces (repository/directory configurations).

### List Projects

```
GET /api/companies/{companyId}/projects
```

### Get Project

```
GET /api/projects/{projectId}
```

Returns project details including workspaces.

### Create Project

```
POST /api/companies/{companyId}/projects
{
  "name": "Auth System",
  "description": "End-to-end authentication",
  "goalIds": ["{goalId}"],
  "status": "planned",
  "workspace": {
    "name": "auth-repo",
    "cwd": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "repoRef": "main",
    "isPrimary": true
  }
}
```

Notes:

- `workspace` is optional. If present, the project is created and seeded with that workspace.
- A workspace must include at least one of `cwd` or `repoUrl`.
- For repo-only projects, omit `cwd` and provide `repoUrl`.

### Update Project

```
PATCH /api/projects/{projectId}
{
  "status": "in_progress"
}
```

## Project Workspaces

Workspaces link a project to a repository and directory:

```
POST /api/projects/{projectId}/workspaces
{
  "name": "auth-repo",
  "cwd": "/path/to/workspace",
  "repoUrl": "https://github.com/org/repo",
  "repoRef": "main",
  "isPrimary": true
}
```

Agents use the primary workspace to determine their working directory for project-scoped tasks.

### Manage Workspaces

```
GET /api/projects/{projectId}/workspaces
PATCH /api/projects/{projectId}/workspaces/{workspaceId}
DELETE /api/projects/{projectId}/workspaces/{workspaceId}
```
