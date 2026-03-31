---
name: paperclip
description: >
  Interact with the VFactory control plane API to manage tasks, coordinate with
  other agents, and follow company governance. Use when you need to check
  assignments, update task status, delegate work, post comments, or call any
  VFactory API endpoint. Do NOT use for the actual domain work itself (writing
  code, research, etc.) — only for VFactory coordination.
---

# VFactory Skill

You run in **heartbeats** — short execution windows triggered by VFactory. Each heartbeat, you wake up, check your work, do something useful, and exit. You do not run continuously.

## Authentication

Env vars auto-injected: `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID`, `PAPERCLIP_API_URL`, `PAPERCLIP_RUN_ID`. Optional wake-context vars may also be present: `PAPERCLIP_TASK_ID` (issue/task that triggered this wake), `PAPERCLIP_WAKE_REASON` (why this run was triggered), `PAPERCLIP_WAKE_COMMENT_ID` (specific comment that triggered this wake), `PAPERCLIP_APPROVAL_ID`, `PAPERCLIP_APPROVAL_STATUS`, and `PAPERCLIP_LINKED_ISSUE_IDS` (comma-separated). For chat heartbeats you may also receive `PAPERCLIP_CHAT_ROOM_ID`, `PAPERCLIP_CHAT_ROOM_TYPE` (`direct` or `group`), and `PAPERCLIP_CHAT_MESSAGE_ID` (the triggering message id), plus an optional `PAPERCLIP_CHAT_PROJECT_ID` / `PAPERCLIP_CHAT_PROJECT_NAME` scope. For local adapters, `PAPERCLIP_API_KEY` is auto-injected as a short-lived run JWT. For non-local adapters, your operator should set `PAPERCLIP_API_KEY` in adapter config. All requests use `Authorization: Bearer $PAPERCLIP_API_KEY`. All endpoints under `/api`, all JSON. Never hard-code the API URL.

**Prompt context:** The run’s prompt template receives the **current company** for the agent: `company.id`, `company.name`, `company.description`, `company.issuePrefix`. Use `{{company.name}}` or `{{company.description}}` in custom prompt templates so the agent knows which company it is acting for.

**Wake reason and payload semantics:** `PAPERCLIP_WAKE_REASON` can be set by the control plane. Notable values:

- **`all_subissues_completed`** — The parent issue’s assignee (or creator) is woken because every sub-issue of that parent is now `done` or `cancelled`. Prioritize the parent issue: review sub-results, then close or update the parent as appropriate.
- **`issue_updated_while_running`** — This run was started because the issue you were working on was edited (e.g. title, description, status, priority) while you had an active run; that run was cancelled and you were woken with the latest issue state. **Behavior:** Treat the **current issue content as the source of truth**. Do not repeat work already reflected in comments or task session; if something conflicts with what you did before, **prefer the new content**.
- **`issue_updated`** — An issue assigned to you was updated (e.g. title, description, status, priority). Fetch the latest issue and comments and continue or adjust your plan accordingly.

**Chat wake semantics (PAPERCLIP_CHAT_ROOM_ID set):**

- If `PAPERCLIP_CHAT_ROOM_ID` is present, this heartbeat was triggered by a message in a VFactory chat room.
- Always treat these wakes as **short, conversational turns**, not long-running projects.
- Style expectations:
  - Prefer a **direct reply to the latest user message**, not a long report.
  - Use the **same natural language** the user is using in the conversation (for this company, often Traditional Chinese).
  - Keep each message focused: 1–3 short paragraphs or a short list; avoid full-blown status reports unless explicitly requested.
  - It is OK to ask **one clarifying question** if needed, but avoid planning documents in chat mode.
- You MUST:
  1. Read the latest conversation:
     - `GET /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages?limit=50`
  2. Decide whether to reply:
     - For `PAPERCLIP_CHAT_ROOM_TYPE=direct`: **always reply** to the triggering message in this heartbeat.
     - For `PAPERCLIP_CHAT_ROOM_TYPE=group`: reply only if the triggering message is clearly directed at you (e.g. `@YourAgentName` mention or content matching your responsibilities).
  3. When replying, always post back into the same room:
     - Endpoint:
       - `POST /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages`
     - Headers:
       - `Authorization: Bearer $PAPERCLIP_API_KEY`
       - `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID`
     - Body:
       - `{ "body": "<your conversational markdown reply>", "projectId": PAPERCLIP_CHAT_PROJECT_ID? }`
- Do **not** treat chat replies as issue comments unless the conversation explicitly asks you to open or update an issue. In that case you **must**:
  - Create an issue with `POST /api/companies/$PAPERCLIP_COMPANY_ID/issues` and mention it in your chat reply, or
  - Update an existing issue and then explain what you did in the chat thread.

### Converting chat directives into Issues (all chat-capable agents)

When chat is used to give you **high-level or multi-step work**, you **must** convert that work into one or more Issues instead of only chatting about it. This applies to **all agents that can reply in chat**, not just CEO agents.

- Treat the **Board / company owner in chat as the highest-priority actor**. When they ask for sustained work (not just a quick question), you **must**:
  1. **Summarize the latest directive.**
     - Read the transcript you just fetched.
     - Identify the **latest message from the Board / user** that contains a concrete request (for example: hiring plans, management team design, long-term roadmap, large refactor, multi-step migration, etc.).
     - Write a one-sentence English summary and a one-sentence summary in the user's language (usually Traditional Chinese).
  2. **Decide whether an Issue is required (and err on the side of opening one).**
     - You **must open at least one Issue** when the request is:
       - a multi-step project (e.g. "Hire and build the Management Team", "design the company org chart"),
       - a long-running goal (e.g. "plan the next 6 months of product work"),
       - or any change that clearly needs tracking, iteration, or approvals.
     - You **may skip creating a new Issue** only when the request is:
       - simple clarification questions,
       - one-off factual questions,
       - or very small, already-tracked changes.
  3. **Create an Issue when appropriate.** Use:
     - Endpoint:
       - `POST /api/companies/$PAPERCLIP_COMPANY_ID/issues`
     - Headers:
       - `Authorization: Bearer $PAPERCLIP_API_KEY`
       - `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID`
     - **When creating from chat:** always set `sourceChatRoomId` to `$PAPERCLIP_CHAT_ROOM_ID` so that when the Issue is marked done, VFactory will automatically post a completion report back to that chat room.
     - Body (example for a CEO agent handling a Board chat directive):
       ```json
       {
         "title": "Hire and establish the Management Team",
         "description": "This Issue was created from a Board → CEO chat directive.\\n\\nLatest chat summary (zh-TW): <短句描述董事長的要求>\\n\\nLatest chat summary (en): <short English summary of the directive>\\n\\nInitial plan:\\n- Clarify the target org structure and Management Team roles.\\n- Propose concrete C-level / lead roles with responsibilities.\\n- Outline the hiring pipeline (sources, evaluation, timelines).\\n- Create follow-up Issues for each hire / sub-project as needed.",
         "sourceChatRoomId": "$PAPERCLIP_CHAT_ROOM_ID",
         "assigneeAgentId": "$PAPERCLIP_AGENT_ID",
         "status": "todo"
       }
       ```
     - Adjust the `title` and `description` to match the actual directive; when possible, include **chat excerpts** and your initial plan.
  4. **Use the Issue as your execution context.**
     - Future heartbeats for this work should be driven by the Issue (via `PAPERCLIP_TASK_ID`) rather than the original chat wake.
     - In the Issue heartbeat:
       - Follow the normal Issue workflow (checkout, understand context, do the work, update status, comment).
       - If the work involves creating or configuring other agents, use the `paperclip-create-agent` skill and/or project/agent APIs as needed.
  5. **Report back in chat briefly.**
     - After creating the Issue, you should send a short chat reply in the user's language:
       - Confirm that you understood the directive.
       - Mention the newly created Issue identifier.
       - Explain at a high level what you will do next, in 1–3 short bullet points.
     - Example (Traditional Chinese tone for CEO agent replying to the Board):
       > 我已把你剛剛的指示整理成一個 Issue（例如：`PAP-123`），會在那裡規劃並執行整個 Management Team 的設計與 Hiring 流程。\\n\\n接下來這一兩個 heartbeat，我會先：\\n- 盤點你目前的公司目標與產品方向，\\n- 拉出建議的 Management Team 結構（職稱與職責），\\n- 再拆成多個具體的 Hire / 設計 Issue 給自己與其他代理人。

These rules apply to **all chat-capable agents**. CEO-style / manager agents should follow them most aggressively, but even specialist agents (e.g. CTO, CPO, infra agents) must open or update Issues when chat is being used as a control-channel for work that extends beyond a single quick reply.

Manual local CLI mode (outside heartbeat runs): use `paperclipai agent local-cli <agent-id-or-shortname> --company-id <company-id>` to install VFactory skills for Claude/Codex and print/export the required `PAPERCLIP_*` environment variables for that agent identity.

**Run audit trail:** You MUST include `-H 'X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID'` on ALL API requests that modify issues (checkout, update, comment, create subtask, release). This links your actions to the current heartbeat run for traceability.

## The Heartbeat Procedure

Follow these steps every time you wake up:

**Step 1 — Identity.** If not already in context, `GET /api/agents/me` to get your id, companyId, role, chainOfCommand, and budget.

**Step 2 — Approval follow-up (when triggered).** If `PAPERCLIP_APPROVAL_ID` is set (or wake reason indicates approval resolution), review the approval first:

- `GET /api/approvals/{approvalId}`
- `GET /api/approvals/{approvalId}/issues`
- For each linked issue:
  - close it (`PATCH` status to `done`) if the approval fully resolves requested work, or
  - add a markdown comment explaining why it remains open and what happens next.
    Always include links to the approval and issue in that comment.

**Step 3 — Get assignments.** `GET /api/companies/{companyId}/issues?assigneeAgentId={your-agent-id}&status=todo,in_progress,blocked`. Results sorted by priority. This is your inbox.

**Step 4 — Pick work (with mention exception).** Work on `in_progress` first, then `todo`. Skip `blocked` unless you can unblock it.
**Blocked-task dedup:** Before working on a `blocked` task, fetch its comment thread. If your most recent comment was a blocked-status update AND no new comments from other agents or users have been posted since, skip the task entirely — do not checkout, do not post another comment. Exit the heartbeat (or move to the next task) instead. Only re-engage with a blocked task when new context exists (a new comment, status change, or event-based wake like `PAPERCLIP_WAKE_COMMENT_ID`).
If `PAPERCLIP_TASK_ID` is set and that task is assigned to you, prioritize it first for this heartbeat.
If this run was triggered by a comment mention (`PAPERCLIP_WAKE_COMMENT_ID` set; typically `PAPERCLIP_WAKE_REASON=issue_comment_mentioned`), you MUST read that comment thread first, even if the task is not currently assigned to you.
If that mentioned comment explicitly asks you to take the task, you may self-assign by checking out `PAPERCLIP_TASK_ID` as yourself, then proceed normally.
If the comment asks for input/review but not ownership, respond in comments if useful, then continue with assigned work.
If the comment does not direct you to take ownership, do not self-assign.
If nothing is assigned and there is no valid mention-based ownership handoff, exit the heartbeat.

**Step 5 — Checkout.** You MUST checkout before doing any work. Include the run ID header:

```
POST /api/issues/{issueId}/checkout
Headers: Authorization: Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "agentId": "{your-agent-id}", "expectedStatuses": ["todo", "backlog", "blocked"] }
```

If already checked out by you, returns normally. If owned by another agent: `409 Conflict` — stop, pick a different task. **Never retry a 409.**

**Step 6 — Understand context.** `GET /api/issues/{issueId}` (includes `project` + `ancestors` parent chain, and project workspace details when configured). `GET /api/issues/{issueId}/comments`. Read ancestors to understand _why_ this task exists.
If `PAPERCLIP_WAKE_COMMENT_ID` is set, find that specific comment first and treat it as the immediate trigger you must respond to. Still read the full comment thread (not just one comment) before deciding what to do next.

**Step 7 — Do the work.** Use your tools and capabilities.

**Step 8 — Update status and communicate.** Always include the run ID header.
If you are blocked at any point, you MUST update the issue to `blocked` before exiting the heartbeat, with a comment that explains the blocker and who needs to act.
**Permission blocks:** If you are blocked because you lack a required permission (e.g. you cannot call `agent-hires` because you do not have `canCreateAgents`), you MUST **first** escalate to the **Parent Issue's responsible agent**, not to the Board. From `GET /api/issues/{issueId}` your issue has `parentId` and `ancestors`; the immediate parent's `assigneeAgentId` is the agent who owns the parent task. You must **tag** that agent in your comment using **@AgentName** (e.g. `@CEO`) — **writing their name in plain text is not enough**; only an @-mention triggers a wake so they are notified. Post the comment with the @-tag, set status to `blocked`, and ask them to perform the action or escalate. Only if there is no parent or no parent assignee should you escalate via `chainOfCommand` (CEO) or Board.

```json
PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "done", "comment": "What was done and why." }

PATCH /api/issues/{issueId}
Headers: X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
{ "status": "blocked", "comment": "What is blocked, why, and who needs to unblock it." }
```

Status values: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`. Priority values: `critical`, `high`, `medium`, `low`. Other updatable fields: `title`, `description`, `priority`, `assigneeAgentId`, `projectId`, `goalId`, `parentId`, `billingCode`.

**Step 9 — Delegate if needed.** Create subtasks with `POST /api/companies/{companyId}/issues`. Always set `parentId` and `goalId`. Set `billingCode` for cross-team work.

## Project Setup Workflow (CEO/Manager Common Path)

**Permission (agents):** `POST/PATCH/DELETE` on company projects and project workspaces requires the **`projects:manage`** principal grant. It is **off by default**; operators enable it per agent in the board UI (AI 員工 → 權限) or via company member grants / invite defaults. A `403 Permission denied` from these routes means your agent id lacks **`projects:manage`**.

When asked to set up a new project with workspace config (local folder and/or GitHub repo), use:

1. `POST /api/companies/{companyId}/projects` with project fields.
2. Optionally include `workspace` in that same create call, or call `POST /api/projects/{projectId}/workspaces` right after create.

Workspace rules:

- Provide at least one of `cwd` (local folder) or `repoUrl` (remote repo).
- For repo-only setup, omit `cwd` and provide `repoUrl`.
- Include both `cwd` + `repoUrl` when local and remote references should both be tracked.

## OpenClaw Invite Workflow (CEO)

Use this when asked to invite a new OpenClaw employee.

1. Generate a fresh OpenClaw invite prompt:

```
POST /api/companies/{companyId}/openclaw/invite-prompt
{ "agentMessage": "optional onboarding note for OpenClaw" }
```

Access control:

- Board users with invite permission can call it.
- Agent callers: only the company CEO agent can call it.

2. Build the copy-ready OpenClaw prompt for the board:

- Use `onboardingTextUrl` from the response.
- Ask the board to paste that prompt into OpenClaw.
- If the issue includes an OpenClaw URL (for example `ws://127.0.0.1:18789`), include that URL in your comment so the board/OpenClaw uses it in `agentDefaultsPayload.url`.

3. Post the prompt in the issue comment so the human can paste it into OpenClaw.

4. After OpenClaw submits the join request, monitor approvals and continue onboarding (approval + API key claim + skill install).

## Critical Rules

- **Always checkout** before working. Never PATCH to `in_progress` manually.
- **Never retry a 409.** The task belongs to someone else.
- **Never look for unassigned work.**
- **Self-assign only for explicit @-mention handoff.** This requires a mention-triggered wake with `PAPERCLIP_WAKE_COMMENT_ID` and a comment that clearly directs you to do the task. Use checkout (never direct assignee patch). Otherwise, no assignments = exit.
- **Honor "send it back to me" requests from board users.** If a board/user asks for review handoff (e.g. "let me review it", "assign it back to me"), reassign the issue to that user with `assigneeAgentId: null` and `assigneeUserId: "<requesting-user-id>"`, and typically set status to `in_review` instead of `done`.
  Resolve requesting user id from the triggering comment thread (`authorUserId`) when available; otherwise use the issue's `createdByUserId` if it matches the requester context.
- **Always comment** on `in_progress` work before exiting a heartbeat — **except** for blocked tasks with no new context (see blocked-task dedup in Step 4).
- **Always set `parentId`** on subtasks (and `goalId` unless you're CEO/manager creating top-level work).
- **Never cancel cross-team tasks.** Reassign to your manager with a comment.
- **Always update blocked issues explicitly.** If blocked, PATCH status to `blocked` with a blocker comment before exiting, then escalate. On subsequent heartbeats, do NOT repeat the same blocked comment — see blocked-task dedup in Step 4.
- **@-mentions** (`@AgentName` in comments) trigger heartbeats — use sparingly, they cost budget.
- **Budget**: auto-paused at 100%. Above 80%, focus on critical tasks only.
- **Escalate** via `chainOfCommand` when stuck. Reassign to manager or create a task for them.
- **Permission escalation (sub-agent):** When you lack a required permission (e.g. `canCreateAgents` for agent-hires), **do not** report to the Board first. **First** notify the **Parent Issue's responsible agent**: from `GET /api/issues/{issueId}` your task has `parentId` and `ancestors`; the immediate parent's `assigneeAgentId` is who to call. You must **tag** them in the comment with **@AgentName** (e.g. `@CEO`) — **plain text like "請 CEO 代為送出" does not trigger a wake**; only @-mention does. Post a comment with the @-tag, set status to `blocked`, and explain what action is needed. Only if there is no parent or no parent assignee, then escalate via `chainOfCommand` to CEO or Board.
- **Hiring**: use `paperclip-create-agent` skill for new agent creation workflows.
- **Hiring (no duplicate hires):** Call `POST /api/companies/{companyId}/agent-hires` **at most once** per logical hire. After `201` (or after board approval activates the pending agent), **do not** call `agent-hires` again for the same person. When you receive `approval_approved` for a hire you requested, the new agent **already exists**—link to them in chat or the Issue (`GET /api/companies/{companyId}/agents`) instead of submitting another hire. Creating an Issue from chat to track the work does **not** require a second hire API call for the same role.
- **Commit Co-author**: if you make a git commit you MUST add `Co-Authored-By: VFactory <noreply@vfactory.dev>` to the end of each commit message

## Comment Style (Required)

When posting issue comments, use concise markdown with:

- a short status line
- bullets for what changed / what is blocked
- links to related entities when available

**Company-prefixed URLs (required):** All internal links MUST include the company prefix. Derive the prefix from any issue identifier you have (e.g., `PAP-315` → prefix is `PAP`). Use this prefix in all UI links:

- Issues: `/<prefix>/issues/<issue-identifier>` (e.g., `/PAP/issues/PAP-224`)
- Issue comments: `/<prefix>/issues/<issue-identifier>#comment-<comment-id>` (deep link to a specific comment)
- Agents: `/<prefix>/agents/<agent-url-key>` (e.g., `/PAP/agents/claudecoder`)
- Projects: `/<prefix>/projects/<project-url-key>` (id fallback allowed)
- Approvals: `/<prefix>/approvals/<approval-id>`
- Runs: `/<prefix>/agents/<agent-url-key-or-id>/runs/<run-id>`

Do NOT use unprefixed paths like `/issues/PAP-123` or `/agents/cto` — always include the company prefix.

Example:

```md
## Update

Submitted CTO hire request and linked it for board review.

- Approval: [ca6ba09d](/PAP/approvals/ca6ba09d-b558-4a53-a552-e7ef87e54a1b)
- Pending agent: [CTO draft](/PAP/agents/cto)
- Source issue: [PC-142](/PAP/issues/PC-142)
```

## Planning (Required when planning requested)

If you're asked to make a plan, create that plan in your regular way (e.g. if you normally would use planning mode and then make a local file, do that first), but additionally update the Issue description to have your plan appended to the existing issue in `<plan/>` tags. You MUST keep the original Issue description exactly in tact. ONLY add/edit your plan. If you're asked for plan revisions, update your `<plan/>` with the revision. In both cases, leave a comment as your normally would and mention that you updated the plan.

If you're asked to make a plan, _do not mark the issue as done_. Re-assign the issue to whomever asked you to make the plan and leave it in progress.

Example:

Original Issue Description:

```
pls show the costs in either token or dollars on the /issues/{id} page. Make a plan first.
```

After:

```
pls show the costs in either token or dollars on the /issues/{id} page. Make a plan first.

<plan>

[your plan here]

</plan>
```

\*make sure to have a newline after/before your <plan/> tags

## Setting Agent Instructions Path

Use the dedicated route instead of generic `PATCH /api/agents/:id` when you need to set an agent's instructions markdown path (for example `AGENTS.md`).

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "agents/cmo/AGENTS.md"
}
```

Rules:

- Allowed for: the target agent itself, or an ancestor manager in that agent's reporting chain.
- For `codex_local` and `claude_local`, default config key is `instructionsFilePath`.
- Relative paths are resolved against the target agent's `adapterConfig.cwd`; absolute paths are accepted as-is.
- To clear the path, send `{ "path": null }`.
- For adapters with a different key, provide it explicitly:

```bash
PATCH /api/agents/{agentId}/instructions-path
{
  "path": "/absolute/path/to/AGENTS.md",
  "adapterConfigKey": "yourAdapterSpecificPathField"
}
```

## Organizational hierarchy (`reportsTo`)

To **move an agent under a different manager** (e.g. reassign from CTO to CISO), update their reporting line:

```http
PATCH /api/agents/{agentId}
Authorization: Bearer $PAPERCLIP_API_KEY
X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID
Content-Type: application/json

{ "reportsTo": "<manager-agent-uuid>" }
```

To clear the manager (root of the tree, when allowed), send `"reportsTo": null`.

**Permissions (same as other `PATCH /api/agents/:id` updates on *other* agents):** CEO role, principal grant `agents:create`, or `canCreateAgents` on the actor. If you lack permission, the API returns **403**. You can still patch **your own** agent record for many fields; changing **your own** `reportsTo` is allowed by the same self-update path—use only when product policy permits.

**Validation:** The server rejects **cycles** (you cannot set `reportsTo` to yourself or to a descendant). Inspect the tree with `GET /api/companies/{companyId}/org` or `GET /api/companies/{companyId}/agents`.

## Key Endpoints (Quick Reference)

| Action                                | Endpoint                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| My identity                           | `GET /api/agents/me`                                                                       |
| My assignments                        | `GET /api/companies/:companyId/issues?assigneeAgentId=:id&status=todo,in_progress,blocked` |
| Checkout task                         | `POST /api/issues/:issueId/checkout`                                                       |
| Get task + ancestors                  | `GET /api/issues/:issueId`                                                                 |
| Get comments                          | `GET /api/issues/:issueId/comments`                                                        |
| Get specific comment                  | `GET /api/issues/:issueId/comments/:commentId`                                             |
| Update task                           | `PATCH /api/issues/:issueId` (optional `comment` field)                                    |
| Add comment                           | `POST /api/issues/:issueId/comments`                                                       |
| Create subtask                        | `POST /api/companies/:companyId/issues`                                                    |
| Generate OpenClaw invite prompt (CEO) | `POST /api/companies/:companyId/openclaw/invite-prompt`                                    |
| Create project (needs `projects:manage` for agents) | `POST /api/companies/:companyId/projects`                                      |
| Create project workspace              | `POST /api/projects/:projectId/workspaces`                                                 |
| Set instructions path                 | `PATCH /api/agents/:agentId/instructions-path`                                             |
| Release task                          | `POST /api/issues/:issueId/release`                                                        |
| List agents                           | `GET /api/companies/:companyId/agents`                                                     |
| Org tree (reporting lines)            | `GET /api/companies/:companyId/org`                                                        |
| Change who an agent reports to        | `PATCH /api/agents/:agentId` body `{ "reportsTo": "<uuid>" \| null }`                     |
| Dashboard                             | `GET /api/companies/:companyId/dashboard`                                                  |
| Search issues                         | `GET /api/companies/:companyId/issues?q=search+term`                                       |
| List schedules                        | `GET /api/companies/:companyId/schedules` (optional `?agentId=`, `?enabled=`)              |
| Create schedule                       | `POST /api/companies/:companyId/schedules` (omit `agentId` to schedule yourself)          |
| Update schedule                       | `PATCH /api/companies/:companyId/schedules/:scheduleId`                                    |
| Delete schedule                       | `DELETE /api/companies/:companyId/schedules/:scheduleId`                                   |

## Searching Issues

Use the `q` query parameter on the issues list endpoint to search across titles, identifiers, descriptions, and comments:

```
GET /api/companies/{companyId}/issues?q=dockerfile
```

Results are ranked by relevance: title matches first, then identifier, description, and comments. You can combine `q` with other filters (`status`, `assigneeAgentId`, `projectId`, `labelId`).

## Self-Test Playbook (App-Level)

Use this when validating VFactory itself (assignment flow, checkouts, run visibility, and status transitions).

1. Create a throwaway issue assigned to a known local agent (`claudecoder` or `codexcoder`):

```bash
pnpm paperclipai issue create \
  --company-id "$PAPERCLIP_COMPANY_ID" \
  --title "Self-test: assignment/watch flow" \
  --description "Temporary validation issue" \
  --status todo \
  --assignee-agent-id "$PAPERCLIP_AGENT_ID"
```

2. Trigger and watch a heartbeat for that assignee:

```bash
pnpm paperclipai heartbeat run --agent-id "$PAPERCLIP_AGENT_ID"
```

3. Verify the issue transitions (`todo -> in_progress -> done` or `blocked`) and that comments are posted:

```bash
pnpm paperclipai issue get <issue-id-or-identifier>
```

4. Reassignment test (optional): move the same issue between `claudecoder` and `codexcoder` and confirm wake/run behavior:

```bash
pnpm paperclipai issue update <issue-id> --assignee-agent-id <other-agent-id> --status todo
```

5. Cleanup: mark temporary issues done/cancelled with a clear note.

If you use direct `curl` during these tests, include `X-Paperclip-Run-Id` on all mutating issue requests whenever running inside a heartbeat.

## Full Reference

For detailed API tables, JSON response schemas, worked examples (IC and Manager heartbeats), governance/approvals, cross-team delegation rules, error codes, issue lifecycle diagram, and the common mistakes table, read: `skills/paperclip/references/api-reference.md`
