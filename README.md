# Paperclip — AI Agent Orchestration Platform

> **Language / 語言：** [繁體中文](documents/MultiLanguage/README.zh_TW.md) · [简体中文](documents/MultiLanguage/README.zh_CN.md)

A **self-hosted, production-ready control plane for AI coding agents** — forked from [paperclipai/paperclip](https://github.com/paperclipai/paperclip) and extended with **company-level workflows** (SOP-style automation), browser automation, persistent cross-chat memory, richer cost analytics, and several UX improvements. The upstream [`browser-use`](https://github.com/browser-use/browser-use) library is included as a **Git submodule** at repo root (`browser-use/`), and the optional Python microservice installs it in **editable** mode so it tracks that submodule.

---

## What Is This?

Paperclip turns AI coding agents (Claude, Codex, Gemini, Cursor, and more) into **managed team members** inside your own infrastructure. It provides:

- A **central control plane** to create, schedule, and monitor tasks (called *Issues*) across multiple agents
- A **real-time execution environment** where agents check out work, run, and post results back to the server
- An **approval and governance layer** so humans can review, reject, or revise proposed changes before they land
- A **cost and budget engine** so you always know what each agent, project, or billing code is spending
- A **browser automation capability** so agents can interact with live web pages — not just read static files

This repository is a **custom fork** of the upstream Paperclip project. It preserves all upstream functionality and layers on:

| Addition | Description |
|---|---|
| Browser-Use microservice | Wraps the `browser-use` Python library as a secure FastAPI service; agents can open, navigate, and interact with real Chromium browsers |
| Instance Sidebar | Collapsible, resizable sidebar for instance-level navigation |
| Instance Settings UI | Full settings panel for instance administration |
| Agent Tree & Model Filtering | Filter the agent list by model, status, or hierarchy |
| Cost Charts | Interactive cost breakdown charts per agent, project, and billing code; **prompt cache tokens** (`cachedReadTokens` / `cachedWriteTokens`) stored on `cost_events`, rolled into aggregations, CSV export, and charts |
| Execution Labels | Visual labels on runs showing current execution state |
| Issue / Sub-task Wake-up | When a sub-task completes or an issue is updated, the parent agent is automatically woken up |
| Resizable Sidebar | Drag-to-resize sidebar panels across the UI |
| Company workflows | Visual flow editor, run history, worker approvals, and optional LLM-backed prompt steps; UI and routes live under `/company/workflows` (legacy `/company/skills` redirects here) |
| `browser-use` as Git submodule | Upstream library is not vendored as a flat copy — pin the submodule commit in git, and install it with `-e ../../browser-use` from `browser-use-service` |
| Observability | Company-scoped **service logs** API + DB storage (`application_log_entries`); **Prometheus** metrics at `GET /metrics` (optional scrape token), with Express **`observability-http`** middleware recording per-route latency and status into `server/src/telemetry/`; **platform alert** webhook creates Issues from external monitoring |
| CI / delivery | Root **GitHub Actions** workflow (path-filtered to `paperclip-official/`) runs typecheck, tests, build, and `security:audit`; **`deploy-with-rollback.sh`** script for symlink-based artifact deploy with health check + rollback |
| Roadmap & overrides | **Versioned roadmap** and **human override** tables + REST API; optional **materialize** endpoint turns markdown list lines into backlog Issues; planning-priority rules for autonomy; optional **watchdog** escalation Issues when reaping stuck runs |

---

## Why This Project?

Most AI agent tooling falls into one of these traps:

**1. Cloud-only vendor lock-in** — Your code, your conversations, and your secrets go to someone else's servers. Switching providers is painful. Auditing is impossible.

**2. No orchestration** — Individual agent tools can run one agent at a time. There is no way to assign tasks to different agents, track their progress as a team, gate changes behind reviews, or roll up costs across projects.

**3. No real-world browser access** — Agents can reason and write code but cannot log into a staging environment, fill a form, or verify that a deployed feature actually works in the browser.

**This fork solves all three:**

- Everything runs in your own infrastructure. No telemetry leaves your environment.
- Issues, agents, approvals, costs, goals, and schedules are all first-class entities managed by a single backend.
- The Browser-Use microservice gives any agent a real, scriptable Chromium browser via a secure internal API.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web UI  (React 19 / Vite 6)               │
│  Dashboard · Issues · Agents · Costs · Approvals · Chat · ...    │
└────────────────────────────┬─────────────────────────────────────┘
                             │  REST + WebSocket (live events)
┌────────────────────────────▼─────────────────────────────────────┐
│                   Server  (Node.js / Express 5)                   │
│                                                                   │
│  Routes                         Services                          │
│  ─────────────────────          ──────────────────────────────    │
│  issues · agents · chat · company-skills · workflow-runs   heartbeat (run orchestration)       │
│  approvals · costs · goals      agent-memories (cross-chat)       │
│  schedules · projects           browser-use-gateway (HMAC proxy)  │
│  service-logs · roadmap ·       application logs · metrics          │
│  platform-alerts (webhook)      (Prometheus text / alerts→Issue)  │
│  plugins · secrets              realtime (WebSocket broadcast)    │
│  instance/* · scim              cost / budget enforcement         │
│                                                                   │
│  Auth: Better Auth · Agent JWT · SCIM provisioning                │
│  Ops:  GET /api/health · GET /metrics (optional) · HTTP metrics middleware · CI in .github  │
│  DB:   PostgreSQL + Drizzle ORM (embedded-postgres for local dev) │
└──────┬──────────────────────────────────────┬────────────────────┘
       │  adapter spawn / heartbeat           │  HMAC-signed HTTP
┌──────▼──────────────────────┐   ┌───────────▼────────────────────┐
│       Agent Adapters         │   │     Browser-Use Service        │
│                              │   │     (Python / FastAPI)         │
│  claude-local  (Claude CLI)  │   │                                │
│  codex-local   (Codex CLI)   │   │  /v1/sessions/start            │
│  cursor-local  (Cursor IDE)  │   │  /v1/navigate                  │
│  gemini-local  (Gemini CLI)  │   │  /v1/state                     │
│  opencode-local              │   │  /v1/click  /v1/type           │
│  pi-local                    │   │  /v1/extract /v1/screenshot    │
│  openclaw-gateway (WebSocket)│   │  /v1/sessions/close            │
└──────────────────────────────┘   └────────────────────────────────┘
```

---

## Feature Reference

### Issues — Task Management

Issues are the primary unit of work. Each issue can be:

- Assigned to a specific agent or left in a pool for any agent to claim
- Tagged with labels, linked to a project, and associated with a parent goal
- Checked out by an agent (preventing parallel edits), then released or completed
- Subscribed to by team members for real-time notifications
- Augmented with comments and file attachments
- Organised into saved views with custom filters

When a sub-task (child issue) is resolved or an issue is updated by an agent, the **checkout wake-up** mechanism automatically resumes any waiting parent agent, eliminating manual polling.

---

### Agents — Multi-Adapter Execution

Each agent is backed by one of the following adapter types. The adapter determines how Paperclip spawns, communicates with, and monitors the underlying AI process.

| Adapter | Backend | Transport |
|---|---|---|
| `claude-local` | Anthropic Claude Code CLI | stdio / process spawn |
| `codex-local` | OpenAI Codex CLI | stdio / process spawn |
| `cursor-local` | Cursor IDE agent | stdio / process spawn (stream-json usage parsing includes **`cached_input_tokens`** and separate **cache read / write** fields where present) |
| `gemini-local` | Google Gemini CLI | stdio / process spawn |
| `opencode-local` | OpenCode agent | stdio / process spawn |
| `pi-local` | Pi agent | stdio / process spawn |
| `openclaw-gateway` | Any remote agent | WebSocket (challenge → connect → run) |

**Configurable per agent:**
- `model` — which model variant to use
- `cwd` — working directory for file operations
- `instructionsFilePath` — path to a custom system prompt file
- `workspaceStrategy` — isolated git worktrees per run (parallel safe)
- `workspaceRuntime` — runtime service to inject into the workspace
- `timeoutSec` — hard execution time limit

**Heartbeat system:**
The server's heartbeat service orchestrates the full execution lifecycle — provisioning the workspace, injecting skills and memories, streaming events in real time, enforcing cost budgets, recording run logs, and triggering wake-up callbacks on completion.

**Agent API keys** let agents call back to the Paperclip API to post results, update issue state, or trigger follow-up actions without sharing user credentials.

---

### Browser-Use — AI-Native Browser Automation

The **Browser-Use microservice** (Python / FastAPI) wraps the [`browser-use`](https://github.com/browser-use/browser-use) library and exposes it as a signed internal REST API. Any agent can acquire a browser session and perform real interactions.

**Available operations** (all routes use `POST` and a signed JSON body envelope):

| Endpoint | What it does |
|---|---|
| `POST /v1/sessions/start` | Launch a Chromium browser session (headless or visible) |
| `POST /v1/navigate` | Load a URL in the session |
| `POST /v1/state` | Capture the current page state (DOM snapshot, URL, title) |
| `POST /v1/click` | Click an element by index or coordinates (from page state) |
| `POST /v1/type` | Type text into a focused element |
| `POST /v1/extract` | Extract structured data from the page |
| `POST /v1/screenshot` | Take a screenshot and return as base64 |
| `POST /v1/sessions/close` | Terminate and clean up the session |

**Security model:** Every request from the Node gateway to the Python service is authenticated with HMAC-SHA256 signatures. Three headers are required: `x-tool-signature`, `x-tool-timestamp`, and `x-tool-nonce`. Timestamps are validated within a ±5-minute window; **nonces are stored in Redis** (via `PAPERCLIP_REDIS_URL` or `PAPERCLIP_BROWSER_USE_NONCE_REDIS_URL`) to prevent replay across instances. An optional `x-tool-token` header adds a second layer of authentication.

**Debug mode:** Set `PAPERCLIP_BROWSER_USE_DEBUG=true` on both the Node server and the Python service to run sessions in non-headless mode — a real Chromium window will appear on screen for visual debugging.

---

### Agent Memory — Persistent Cross-Chat Context

Agents accumulate a personal memory store that persists across chat rooms and sessions.

- Facts, observations, and decisions are written as structured memory entries
- The memory service summarises older entries to stay within token budgets (configurable character caps)
- Relevant memories are retrieved and injected into the system prompt at the start of each new chat
- Memories are scoped per agent and searchable by keyword or source room

This enables long-running agents to maintain continuity — knowing what they worked on last week, what decisions were made, and what problems they encountered.

---

### Company Workflows — SOP-Style Automation

Companies can define **workflows**: multi-step flows (conditions, approvals, HTTP calls, LLM prompt steps, worker hand-offs) with a **visual editor**, **run history**, and integration with heartbeat / agent runs. Typical uses include standard operating procedures, gated releases, and human-in-the-loop steps before side effects execute. The UI entry point is **Workflows** in the company sidebar (`/company/workflows`); older bookmarks to `/company/skills` continue to work via redirect.

---

### Approvals — Human-in-the-Loop Governance

Before an agent's proposed changes are accepted, they can be routed through an approval workflow.

- **Approval policies** are defined at the company level and applied automatically
- Reviewers can **approve**, **reject**, or **request revision** with comments
- Revisions are sent back to the agent, which then re-runs and resubmits
- **Auto follow-up** tracks stale approvals and sends reminders
- Full approval history is exportable to CSV for compliance

---

### Observability, CI/CD, and roadmap governance (this fork)

Beyond Pino **stdout / local file** logging, this fork adds **platform-grade** hooks for running Paperclip like a product:

| Area | What to know |
|---|---|
| **Service logs** | Structured rows in PostgreSQL (`application_log_entries`); list/query and ingest via company-scoped **service-logs** routes (RBAC applies). Distinct from **`activity_log`** (audit) and from raw Pino files. |
| **Metrics** | **`GET /metrics`** exposes Prometheus text (per-route HTTP latency sum/count via `observabilityHttpMetrics`, 5xx, schedule/heartbeat tick errors, heartbeat run failures, etc.). Set `PAPERCLIP_METRICS_ENABLED=true`; optional `PAPERCLIP_METRICS_SCRAPE_TOKEN` for Bearer protection. |
| **Alerts → Issues** | **`POST /api/webhooks/platform-alerts`** with header **`X-Paperclip-Alert-Token`** equal to **`PAPERCLIP_ALERT_WEBHOOK_SECRET`** (JSON body validated with Zod). Creates an Issue and audit activity — wire external Alertmanager or cloud monitors to this shape. |
| **CI** | **`.github/workflows/paperclip-ci.yml`** (repo root) runs when `paperclip-official/**` changes: `pnpm install`, `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, `pnpm run security:audit` (production deps, critical threshold — adjust in `package.json` if you need stricter gates). |
| **Deploy / rollback** | **`paperclip-official/scripts/deploy-with-rollback.sh`**: extract artifact, flip **`current`** symlink, optional **`PAPERCLIP_HEALTH_URL`** check; on failure, restore previous target; optional **`PAPERCLIP_ACTIVITY_URL`** for rollback audit POST. |
| **Roadmap** | **`roadmap_versions`** / **`roadmap_human_overrides`** + API under **`/api/companies/:companyId/roadmap/...`**. **`POST .../versions/:versionId/materialize`** turns `-` / `*` markdown lines into backlog Issues (capped). |
| **Safety** | Workflow / skill steps can be marked **`dangerous`** — they still require human approval. Server helpers include **`dangerous-action-registry`** and **`planning-priority`** for consistent gating and planning order. **`redaction.ts`** masks sensitive keys in payloads. |
| **Watchdog** | If **`PAPERCLIP_WATCHDOG_ESCALATION_ISSUES=true`**, reaping orphaned heartbeat runs can open a high-priority Issue per affected company. |

Further reading (no secrets in repo): **`paperclip-official/documents/runbooks/diagnostician-alert-issue.md`**, **`paperclip-official/documents/ai-company-open-questions.md`**.

---

### Costs — Spending Visibility

Every LLM call made by every agent is recorded as a cost event.

**Aggregation views:**
- By agent
- By project
- By billing code
- Company-wide rollup
- Interactive time-series charts in the UI

**Prompt cache accounting:** Cost rows and rollups include **cached read** and **cached write** token counts (migrations extend `cost_events` and `agent_runtime_state`). Adapters such as **`cursor-local`** map Cursor `result.usage` fields into heartbeat usage so cache hits are visible next to input/output tokens in the UI and exports.

**Budget enforcement:**
- Define budget policies per company or agent
- The server enforces hard limits — agents that exceed their budget are suspended mid-run
- `limit_breach_events` are recorded for audit purposes
- CSV export for external accounting

---

### Goals & Schedules

**Goals** give agents direction beyond individual issues:
- Hierarchical goal tree linking high-level objectives to concrete issues
- Progress tracking with time-range queries
- Visual goal map in the UI

**Schedules** let you automate recurring work:
- `cron` expressions for recurring triggers
- `once` for one-shot future tasks
- `ranges` for bounded recurring windows
- Conflict detection prevents overlapping schedules

---

### Team & Multi-Tenancy

- **Multi-tenant:** One Paperclip instance can host multiple independent companies with full data isolation
- **SCIM:** Provision and deprovision users automatically from enterprise identity providers (Okta, Azure AD, etc.)
- **RBAC:** Granular role-based access at both company and instance levels
- **Instance groups:** Organise users into groups with inherited permissions
- **Integration tokens:** Issue scoped API tokens for CI/CD pipelines and external tools
- **Webhooks:** Subscribe to company events and receive real-time HTTP callbacks

---

### Secrets Management

- Secrets are stored encrypted in the database (`company_secrets` with versioning)
- Agents receive secrets via the runtime environment — never via chat messages
- Secrets are redacted from all log output
- CLI command for rotating and listing secrets

---

### Plugin System

Extend Paperclip without forking:
- Plugins are registered at server startup
- Each plugin can add routes, inject context into agent runs, or hook into lifecycle events
- `company_plugins` table stores per-company plugin configuration
- First-party plugins listed in the plugin registry; custom plugins drop into the plugins directory

---

### CLI — `paperclipai`

The CLI is the primary tool for operators managing a Paperclip instance.

| Command | Purpose |
|---|---|
| `onboard` | Interactive first-run setup wizard |
| `run` | Run onboard → doctor → start the full stack |
| `doctor [--repair]` | Health checks across all subsystems; auto-repair mode |
| `configure` | Edit LLM, database, logging, server, storage, and secrets config |
| `env` | Manage environment variables |
| `db:backup` | Dump the PostgreSQL database |
| `db:restore` | Restore from a dump |
| `allowed-hostname` | Manage trusted hostnames for private mode |
| `auth bootstrap-ceo` | Generate the first admin invite link |
| `heartbeat run` | Execute a single heartbeat and stream the log |
| `company` | Create, list, and manage companies via API |
| `issue` | Create, list, assign, and close issues via API |
| `agent` | List, configure, and manage agents via API |
| `approval` | Review and resolve approvals via API |
| `activity` | Stream live activity logs |
| `dashboard` | Print a summary dashboard |
| `worktree` | Manage git worktrees for parallel agent execution |

---

### Web UI — Pages

| Page | What you can do |
|---|---|
| Dashboard | High-level summary of active agents, open issues, and recent costs |
| Issues | List, filter (saved views), create, and manage issues |
| Issue Detail | Full issue view: chat transcript, run history, approvals, comments, attachments |
| Agents | Tree view with model/status filtering; create and configure agents |
| Agent Detail | Config, run history, cost breakdown, memory browser, live run view |
| Run Quality | Aggregate quality metrics and error clusters across all runs |
| Projects | Organise issues into projects with shared workspaces |
| Goals / Goal Map | Visual goal hierarchy linked to issues |
| Schedules | Create and manage timed triggers |
| Approvals | Review queue with diff view and comment thread |
| Costs | Interactive cost charts by agent, project, and billing code |
| Chat | Direct chat with agents; room-based conversation history |
| Governance | Automation rules, approval policies, webhook and notification config |
| Activity | Company-wide activity log |
| Inbox | Notifications and unread items |
| Instance Settings | User management, group permissions, SCIM keys, compliance retention, archived companies |
| Workflows | Company-level SOP / flow definitions, editor, and run timeline; routes under `/company/workflows` (legacy `/company/skills` redirects) |
| Org Chart | Visual agent hierarchy and reporting structure |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20, pnpm ≥ 9 (monorepo) |
| Backend | TypeScript, Express 5, Zod validation, Pino logging |
| Database | PostgreSQL, Drizzle ORM, embedded-postgres (local dev) |
| Auth | Better Auth, Agent JWT, SCIM 2.0 |
| Real-time | WebSocket (live run events, chat) |
| Frontend | React 19, Vite 6, TanStack Query, React Router 7, react-i18next |
| Testing | Vitest (unit), Playwright (E2E) |
| Browser automation | Python ≥ 3.11, FastAPI, browser-use, Playwright/Chromium |
| CI packaging | pnpm workspaces, TypeScript project references |
| Repo CI | GitHub Actions: `.github/workflows/paperclip-ci.yml` (scoped to `paperclip-official/`) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20, pnpm ≥ 9
- Python ≥ 3.11
- PostgreSQL (or use the embedded-postgres option for local development)
- **Redis** — used for cost caching, workflow coordination, and **browser-use HMAC nonce** storage (same URL as Paperclip or a dedicated nonce URL)

### Clone

```bash
git clone --recurse-submodules <your-fork-or-clone-url> Paperclip
cd Paperclip
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

### 1. Start the Browser-Use Service

`requirements.txt` installs the repo’s **`browser-use` submodule** in editable mode (`-e ../../browser-use`). The submodule must be present (see **Clone** above).

```bash
cd paperclip-official/browser-use-service

python3 -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Must match paperclip-official/.env (and Redis is required for nonce replay protection)
export PAPERCLIP_REDIS_URL="redis://127.0.0.1:6379"
export PAPERCLIP_BROWSER_USE_SERVICE_SECRET="your-shared-secret"
export PAPERCLIP_BROWSER_USE_DEBUG=true    # optional: show browser window

uvicorn app:app --host 127.0.0.1 --port 3001
```

Verify the service is running: open `http://127.0.0.1:3001/docs`.

### 2. Configure and Start Paperclip

```bash
cd paperclip-official

cp .env.example .env
# Required additions to .env:
# PAPERCLIP_REDIS_URL=redis://127.0.0.1:6379
# PAPERCLIP_BROWSER_USE_SERVICE_URL=http://127.0.0.1:3001
# PAPERCLIP_BROWSER_USE_SERVICE_SECRET=<same secret as above>
# PAPERCLIP_BROWSER_USE_DEBUG=true   (optional, match the service side)

pnpm install
pnpm dev
```

The web UI will be available at `http://localhost:3000`.

### 3. First-Time Setup

Run the onboard wizard to configure your database, LLM provider, and admin account:

```bash
pnpm paperclipai onboard
```

Or use the doctor to verify everything is healthy:

```bash
pnpm paperclipai doctor
```

### 4. Verify Browser Automation

Assign an agent a task like:

> "Use Browser-Use to open https://example.com and report the page title."

With `PAPERCLIP_BROWSER_USE_DEBUG=true`, a visible Chromium window should appear when the agent invokes the browser tool.

---

## Project Structure

```
Paperclip/
├── README.md                             ← This file (English)
├── .github/
│   └── workflows/
│       └── paperclip-ci.yml              ← CI for paperclip-official (path filter)
├── browser-use/                          ← Git submodule: upstream browser-use (pinned commit)
├── documents/
│   ├── MultiLanguage/
│   │   ├── README.zh_TW.md               ← Traditional Chinese
│   │   └── README.zh_CN.md               ← Simplified Chinese
│   └── changeLog/                        ← Automated change logs
└── paperclip-official/
    ├── documents/
    │   ├── adr/                          ← Architecture decision records (optional)
    │   ├── runbooks/                     ← e.g. diagnostician alert playbook
    │   └── ai-company-open-questions.md  ← Env / deployment open questions (reference)
    ├── scripts/
    │   ├── release-preflight.sh          ← Release gate (typecheck, test, build)
    │   └── deploy-with-rollback.sh       ← Symlink deploy + health + rollback (optional)
    ├── browser-use-service/              ← Python browser automation service
    │   ├── app.py                        ← FastAPI app + HMAC auth + browser-use
    │   └── requirements.txt              ← editable install: ../../browser-use
    ├── cli/                              ← paperclipai CLI
    │   └── src/
    │       ├── index.ts                  ← Command registration
    │       └── commands/                 ← Individual command implementations
    ├── server/                           ← Node.js backend
    │   └── src/
    │       ├── app.ts                    ← Express app assembly
    │       ├── routes/                   ← REST route handlers
    │       ├── middleware/               ← e.g. observability HTTP metrics
    │       ├── telemetry/                ← Prometheus helpers
    │       ├── lib/                      ← e.g. dangerous-action-registry, planning-priority
    │       └── services/                 ← Business logic (heartbeat, memories, costs, …)
    ├── ui/                               ← React frontend
    │   └── src/
    │       ├── pages/                    ← All UI pages
    │       ├── components/               ← Shared components
    │       └── locales/                  ← i18n strings
    ├── packages/
    │   ├── adapters/                     ← Agent adapter packages
    │   │   ├── claude-local/
    │   │   ├── codex-local/
    │   │   ├── cursor-local/
    │   │   ├── gemini-local/
    │   │   ├── opencode-local/
    │   │   ├── pi-local/
    │   │   └── openclaw-gateway/
    │   ├── db/                           ← Drizzle schema + migrations
    │   ├── shared/                       ← Zod types shared across packages
    │   └── adapter-utils/                ← Shared adapter utilities
    └── AgentSetting/                     ← Agent rules, skills, prompts
        └── promptTemplate/               ← Optional versioned prompt templates (Markdown)
```

---

## Sources & Licensing

| Component | Upstream | License |
|---|---|---|
| Paperclip | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT — Copyright (c) 2025 Paperclip AI |
| Browser-Use | [browser-use/browser-use](https://github.com/browser-use/browser-use) | MIT — Copyright (c) 2024 Gregor Zunic |

Full license text: `paperclip-official/LICENSE`.
