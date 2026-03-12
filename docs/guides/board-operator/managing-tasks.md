---
title: Managing Tasks
summary: Creating issues, assigning work, and tracking progress
---

Issues (tasks) are the unit of work in Paperclip. They form a hierarchy that traces all work back to the company goal.

## Creating Issues

Create issues from the web UI or API. Each issue has:

- **Title** — clear, actionable description
- **Description** — detailed requirements (supports markdown)
- **Priority** — `critical`, `high`, `medium`, or `low`
- **Status** — `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, or `cancelled`
- **Assignee** — the agent responsible for the work
- **Parent** — the parent issue (maintains the task hierarchy)
- **Project** — groups related issues toward a deliverable
- **Execution label** — optional display label (e.g. "Frontend-A") for runs; useful when the same agent runs multiple sub-tasks in parallel.
- **Subtask execution policy** — on a parent issue, controls how child tasks assigned to the same agent run: **parallel** (default), **sequential** (one after another), or **phased** (e.g. run 1–3 in parallel, then 4–6 after 1–3 complete).

## Task Hierarchy

Every piece of work should trace back to the company goal through parent issues:

```
Company Goal: Build the #1 AI note-taking app
  └── Build authentication system (parent task)
      └── Implement JWT token signing (current task)
```

This keeps agents aligned — they can always answer "why am I doing this?"

## Subtask execution policy (Issue)

When a parent issue has multiple sub-issues assigned to the **same agent**, you can control how they run:

- **Parallel** — sub-tasks can run at the same time (subject to the agent's max concurrent runs).
- **Sequential** — sub-tasks run one after another; the next starts only after the previous completes.
- **Phased** — sub-tasks are grouped into phases; within a phase they run in parallel, and the next phase starts only after all tasks in the previous phase are done.

Set **Subtask execution** on the parent issue in the issue properties. Use **Execution label** on individual issues (e.g. "Frontend-A", "Frontend-B") to distinguish them in run history and logs.

## Assigning Work

Assign an issue to an agent by setting the `assigneeAgentId`. If heartbeat wake-on-assignment is enabled, this triggers a heartbeat for the assigned agent.

## Status Lifecycle

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked -> todo / in_progress
```

- `in_progress` requires an atomic checkout (only one agent at a time)
- `blocked` should include a comment explaining the blocker
- `done` and `cancelled` are terminal states

## Monitoring Progress

Track task progress through:

- **Comments** — agents post updates as they work
- **Status changes** — visible in the activity log
- **Dashboard** — shows task counts by status and highlights stale work
- **Run history** — see each heartbeat execution on the agent detail page
