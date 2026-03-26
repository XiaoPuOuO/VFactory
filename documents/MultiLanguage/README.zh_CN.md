# Paperclip — AI 智能体编排平台

> **Language / 语言：** [English](../../README.md) · [繁體中文](README.zh_TW.md)

一个**可自行部署、生产就绪的 AI 代码智能体控制平面** —— fork 自 [paperclipai/paperclip](https://github.com/paperclipai/paperclip)，并扩展了浏览器自动化、跨对话持久记忆、更丰富的成本分析，以及多项 UX 改进。

---

## 这是什么？

Paperclip 将 AI 代码智能体（Claude、Codex、Gemini、Cursor 等）转化为在你自己基础设施中运行的**受管理的团队成员**。它提供：

- 一个**中央控制平面**，用于创建、调度并监控跨多个智能体的任务（称为 *Issue*）
- 一个**实时执行环境**，智能体在此签出工作、执行，并将结果回报给服务器
- 一个**审核与治理层**，让人类可以在变更落地前进行审查、拒绝或修订
- 一个**成本与预算引擎**，让你随时掌握每个智能体、项目或计费代码的支出
- 一个**浏览器自动化能力**，让智能体能与实时网页交互，而不只是读取静态文件

本仓库是上游 Paperclip 的**自定义 Fork**，保留所有上游功能并叠加：

| 新增功能 | 描述 |
|---|---|
| Browser-Use 微服务 | 将 `browser-use` Python 库封装成安全的 FastAPI 服务；智能体可打开、浏览并操作真实的 Chromium 浏览器 |
| Instance Sidebar | 可折叠、可调整宽度的实例级导航侧边栏 |
| Instance Settings UI | 完整的实例管理设置面板 |
| Agent Tree & Model Filtering | 按模型、状态或层级筛选智能体列表 |
| Cost Charts | 按智能体、项目和计费代码的交互式成本明细图表 |
| Execution Labels | 在 Run 上显示当前执行状态的视觉标签 |
| Issue / 子任务唤醒 | 子任务完成或 Issue 更新时，自动唤醒父智能体 |
| 可调整宽度侧边栏 | 整个 UI 中可拖拽调整的侧边栏面板 |

---

## 为什么有这个项目？

大多数 AI 智能体工具都陷入以下陷阱之一：

**1. 云端专属的供应商锁定** —— 你的代码、对话和密钥都存到别人的服务器。切换供应商很痛苦，审计根本无从实现。

**2. 缺乏协作** —— 个别的智能体工具一次只能运行一个智能体。没办法将任务分配给不同的智能体、以团队方式追踪进度、通过审核把关变更，或汇总跨项目的成本。

**3. 无法访问真实浏览器** —— 智能体能推理和编写代码，但无法登录 staging 环境、填写表单，或验证部署的功能在浏览器中是否真的能运行。

**本 Fork 解决以上三点：**

- 一切运行在你自己的基础设施中，无任何遥测数据离开你的环境。
- Issues、智能体、审核、成本、目标和调度都是由单一后端管理的一等公民实体。
- Browser-Use 微服务通过安全的内部 API，为任何智能体提供真实的、可脚本化的 Chromium 浏览器。

---

## 架构

```
┌──────────────────────────────────────────────────────────────────┐
│                  Web UI  (React 19 / Vite 6)                     │
│  Dashboard · Issues · Agents · Costs · Approvals · Chat · ...    │
└────────────────────────┬─────────────────────────────────────────┘
                         │  REST + WebSocket（实时事件）
┌────────────────────────▼─────────────────────────────────────────┐
│                  Server  (Node.js / Express 5)                    │
│                                                                   │
│  路由                            服务                             │
│  ──────────────────────          ────────────────────────────     │
│  issues · agents · chat          heartbeat（Run 编排）             │
│  approvals · costs · goals       agent-memories（跨对话记忆）      │
│  schedules · projects            browser-use-gateway（HMAC 代理） │
│  plugins · secrets               realtime（WebSocket 广播）       │
│  instance/* · scim               cost / budget 强制执行           │
│                                                                   │
│  Auth: Better Auth · Agent JWT · SCIM 配置                        │
│  DB:   PostgreSQL + Drizzle ORM（本地开发可用 embedded-postgres）  │
└──────┬──────────────────────────────────────┬────────────────────┘
       │  adapter spawn / heartbeat           │  HMAC-signed HTTP
┌──────▼──────────────────────┐   ┌───────────▼────────────────────┐
│        Agent Adapters        │   │     Browser-Use Service        │
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

## 功能说明

### Issues — 任务管理

Issue 是工作的基本单位，每个 Issue 可以：

- 分配给特定智能体，或放入可供任何智能体领取的任务池
- 添加标签、关联到项目，并与父目标相连
- 被智能体签出（防止并行编辑），然后释放或完成
- 被团队成员订阅以获得实时通知
- 附上评论和文件附件
- 整理成带有自定义筛选的已保存视图

当子任务（子 Issue）解决或 Issue 被智能体更新时，**checkout wake-up** 机制会自动恢复任何等待中的父智能体，无需人工轮询。

---

### Agents — 多 Adapter 执行

每个智能体由以下其中一种 Adapter 类型支撑。Adapter 决定 Paperclip 如何创建、与底层 AI 进程通信，以及监控其状态。

| Adapter | 后端 | 传输方式 |
|---|---|---|
| `claude-local` | Anthropic Claude Code CLI | stdio / process spawn |
| `codex-local` | OpenAI Codex CLI | stdio / process spawn |
| `cursor-local` | Cursor IDE agent | stdio / process spawn |
| `gemini-local` | Google Gemini CLI | stdio / process spawn |
| `opencode-local` | OpenCode agent | stdio / process spawn |
| `pi-local` | Pi agent | stdio / process spawn |
| `openclaw-gateway` | 任何远程智能体 | WebSocket（challenge → connect → run） |

**每个智能体可配置：**
- `model` — 使用的模型版本
- `cwd` — 文件操作的工作目录
- `instructionsFilePath` — 自定义系统提示词文件路径
- `workspaceStrategy` — 每次执行使用隔离的 git worktree（支持并行执行）
- `workspaceRuntime` — 注入工作区的 runtime 服务
- `timeoutSec` — 执行硬性时间限制

**Heartbeat 系统：**
服务器的 Heartbeat 服务负责协调完整的执行生命周期 —— 配置工作区、注入技能与记忆、实时流式传输事件、强制执行成本预算、记录 Run 日志，并在完成时触发唤醒回调。

---

### Browser-Use — AI 原生浏览器自动化

**Browser-Use 微服务**（Python / FastAPI）封装了 [`browser-use`](https://github.com/browser-use/browser-use) 库，并以已签名的内部 REST API 方式暴露出来。任何智能体都可获取浏览器 Session 并执行真实交互。

**可用操作：**

| 端点 | 功能 |
|---|---|
| `POST /v1/sessions/start` | 启动 Chromium 浏览器 Session（headless 或可见模式） |
| `POST /v1/navigate` | 在 Session 中加载 URL |
| `GET /v1/state` | 捕获当前页面状态（DOM 快照、URL、标题） |
| `POST /v1/click` | 通过选择器或描述点击元素 |
| `POST /v1/type` | 在聚焦元素中输入文字 |
| `POST /v1/extract` | 从页面提取结构化数据 |
| `GET /v1/screenshot` | 截图并以 base64 返回 |
| `POST /v1/sessions/close` | 终止并清理 Session |

**安全模型：** Node 网关对 Python 服务的每个请求都以 HMAC-SHA256 签名验证。必须包含三个 Header：`x-tool-signature`、`x-tool-timestamp` 和 `x-tool-nonce`。时间戳在 ±5 分钟窗口内验证以防止重放攻击。可选的 `x-tool-token` Header 提供第二层验证。

**调试模式：** 在 Node 服务器和 Python 服务两侧都设置 `PAPERCLIP_BROWSER_USE_DEBUG=true`，Session 将以非 headless 模式运行 —— 屏幕上会出现真实的 Chromium 窗口以便目视调试。

---

### 智能体记忆 — 跨对话持久上下文

智能体可在对话室和 Session 间累积个人记忆库。

- 事实、观察和决策以结构化记忆条目写入
- 记忆服务摘要较旧的条目以维持在 Token 预算范围内（可配置字符上限）
- 在每次新对话开始时，相关记忆会被自动检索并注入系统提示
- 记忆以智能体为单位，可按关键字或来源聊天室搜索

这让长期运行的智能体能保持连贯性 —— 知道上周做了什么、做了什么决策，以及遇到了什么问题。

---

### Approvals — 人工介入治理

在智能体提议的变更被接受之前，可以通过审核工作流程进行把关。

- **审核策略**在公司层级定义并自动应用
- 审核者可以**批准**、**拒绝**或**要求修订**并附上评论
- 修订内容回送给智能体，智能体重新执行后再次提交
- **自动后续跟进**追踪过期的审核并发送提醒
- 完整的审核历史可导出为 CSV 供合规使用

---

### Costs — 支出可视化

每个智能体发出的每个 LLM 调用都被记录为成本事件。

**汇总视图：**
- 按智能体
- 按项目
- 按计费代码
- 公司整体汇总
- UI 中的交互式时间序列图表

**预算强制执行：**
- 为每个公司或智能体定义预算策略
- 服务器强制执行硬性限制 —— 超出预算的智能体会在执行途中被暂停
- `limit_breach_events` 记录以供审计
- CSV 导出供外部会计使用

---

### 目标与调度

**目标**为智能体提供超越个别 Issue 的方向：
- 连接高层次目标与具体 Issue 的层级目标树
- 带时间范围查询的进度追踪
- UI 中的可视化目标地图

**调度**让你自动化重复性工作：
- `cron` 表达式用于周期性触发
- `once` 用于一次性未来任务
- `ranges` 用于有界限的重复窗口
- 冲突检测防止调度重叠

---

### 团队与多租户

- **多租户：** 一个 Paperclip 实例可以托管多个完全数据隔离的独立公司
- **SCIM：** 从企业身份验证提供商（Okta、Azure AD 等）自动配置和取消配置用户
- **RBAC：** 公司和实例层级的细粒度基于角色的访问控制
- **Instance 组：** 将用户组织成具有继承权限的组
- **Integration Token：** 为 CI/CD 流水线和外部工具颁发范围限定的 API Token
- **Webhook：** 订阅公司事件并接收实时 HTTP 回调

---

### Secrets 管理

- Secret 以加密形式存储在数据库中（`company_secrets` 带版本控制）
- 智能体通过 runtime 环境接收 Secret —— 绝不通过对话消息传递
- Secret 从所有日志输出中自动脱敏
- CLI 命令支持轮换和列出 Secret

---

### 插件系统

在不 Fork 的情况下扩展 Paperclip：
- 插件在服务器启动时注册
- 每个插件可以添加路由、将上下文注入智能体 Run，或挂钩生命周期事件
- `company_plugins` 表存储每个公司的插件配置
- 第一方插件列于插件目录；自定义插件放入 plugins 目录即可

---

### CLI — `paperclipai`

CLI 是管理 Paperclip 实例的运维人员的主要工具。

| 命令 | 用途 |
|---|---|
| `onboard` | 交互式首次设置向导 |
| `run` | 执行 onboard → doctor → 启动完整服务 |
| `doctor [--repair]` | 跨所有子系统的健康检查；自动修复模式 |
| `configure` | 编辑 LLM、数据库、日志、服务器、存储和 Secrets 配置 |
| `env` | 管理环境变量 |
| `db:backup` | 备份 PostgreSQL 数据库 |
| `db:restore` | 从备份恢复 |
| `allowed-hostname` | 管理私有模式的受信主机名 |
| `auth bootstrap-ceo` | 生成第一个管理员邀请链接 |
| `heartbeat run` | 执行单次 Heartbeat 并流式传输日志 |
| `company` | 通过 API 创建、列出和管理公司 |
| `issue` | 通过 API 创建、列出、分配和关闭 Issue |
| `agent` | 通过 API 列出、配置和管理智能体 |
| `approval` | 通过 API 审查和解决审核 |
| `activity` | 流式传输实时活动日志 |
| `dashboard` | 打印摘要仪表板 |
| `worktree` | 管理并行智能体执行的 git worktree |

---

### Web UI — 页面

| 页面 | 功能 |
|---|---|
| Dashboard | 活跃智能体、开放 Issue 和近期成本的高层次概览 |
| Issues | 列出、筛选（已保存视图）、创建和管理 Issue |
| Issue Detail | 完整 Issue 视图：聊天记录、Run 历史、审核、评论、附件 |
| Agents | 带模型/状态筛选的树状视图；创建和配置智能体 |
| Agent Detail | 配置、Run 历史、成本明细、记忆浏览器、实时 Run 视图 |
| Run Quality | 跨所有 Run 的汇总质量指标和错误聚类 |
| Projects | 将 Issue 组织进带有共享工作区的项目 |
| Goals / Goal Map | 关联至 Issue 的可视化目标层级 |
| Schedules | 创建和管理定时触发器 |
| Approvals | 带 diff 视图和评论串的审核队列 |
| Costs | 按智能体、项目和计费代码的交互式成本图表 |
| Chat | 与智能体的直接对话；基于聊天室的对话历史 |
| Governance | 自动化规则、审核策略、Webhook 和通知配置 |
| Activity | 公司整体活动日志 |
| Inbox | 通知和未读项目 |
| Instance Settings | 用户管理、组权限、SCIM 密钥、合规保留、归档公司 |
| Org Chart | 可视化智能体层级和汇报结构 |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 运行环境 | Node.js ≥ 20，pnpm ≥ 9（Monorepo） |
| 后端 | TypeScript、Express 5、Zod 验证、Pino 日志 |
| 数据库 | PostgreSQL、Drizzle ORM、embedded-postgres（本地开发） |
| 认证 | Better Auth、Agent JWT、SCIM 2.0 |
| 实时通信 | WebSocket（实时 Run 事件、聊天） |
| 前端 | React 19、Vite 6、TanStack Query、React Router 7、react-i18next |
| 测试 | Vitest（单元）、Playwright（E2E） |
| 浏览器自动化 | Python ≥ 3.11、FastAPI、browser-use、Playwright/Chromium |
| CI 打包 | pnpm workspaces、TypeScript 项目引用 |

---

## 快速开始

### 前置要求

- Node.js ≥ 20，pnpm ≥ 9
- Python ≥ 3.11
- PostgreSQL（或本地开发使用 embedded-postgres）

### 1. 启动 Browser-Use 服务

```bash
cd paperclip-official/browser-use-service

python3 -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 必须与 paperclip-official/.env 中的值一致
export PAPERCLIP_BROWSER_USE_SERVICE_SECRET="your-shared-secret"
export PAPERCLIP_BROWSER_USE_DEBUG=true    # 可选：显示浏览器窗口

uvicorn app:app --host 127.0.0.1 --port 3001
```

确认服务运行：打开 `http://127.0.0.1:3001/docs`。

### 2. 配置并启动 Paperclip

```bash
cd paperclip-official

cp .env.example .env
# 在 .env 中添加：
# PAPERCLIP_BROWSER_USE_SERVICE_URL=http://127.0.0.1:3001
# PAPERCLIP_BROWSER_USE_SERVICE_SECRET=<与上方相同的 secret>
# PAPERCLIP_BROWSER_USE_DEBUG=true   （可选，与服务端保持一致）

pnpm install
pnpm dev
```

Web UI 将在 `http://localhost:3000` 上可用。

### 3. 首次设置

运行 onboard 向导以配置数据库、LLM 提供商和管理员账号：

```bash
pnpm paperclipai onboard
```

或使用 doctor 验证一切正常：

```bash
pnpm paperclipai doctor
```

### 4. 验证浏览器自动化

分配智能体一个如下的任务：

> "Use Browser-Use to open https://example.com and report the page title."

设置 `PAPERCLIP_BROWSER_USE_DEBUG=true` 后，当智能体调用浏览器工具时，应出现可见的 Chromium 窗口。

---

## 项目结构

```
Paperclip/
├── README.md                             ← 英文主 README
├── documents/
│   ├── MultiLanguage/
│   │   ├── README.zh_TW.md               ← 繁体中文
│   │   └── README.zh_CN.md               ← 本文件（简体中文）
│   └── changeLog/                        ← 自动化变更记录
└── paperclip-official/
    ├── browser-use-service/              ← Python 浏览器自动化服务
    │   ├── app.py                        ← FastAPI + HMAC 认证 + browser-use
    │   └── requirements.txt
    ├── cli/                              ← paperclipai CLI
    │   └── src/
    │       ├── index.ts                  ← 命令注册
    │       └── commands/                 ← 各命令实现
    ├── server/                           ← Node.js 后端
    │   └── src/
    │       ├── app.ts                    ← Express 应用组装
    │       ├── routes/                   ← REST 路由处理器
    │       └── services/                 ← 业务逻辑（heartbeat、记忆、成本等）
    ├── ui/                               ← React 前端
    │   └── src/
    │       ├── pages/                    ← 所有 UI 页面
    │       ├── components/               ← 共享组件
    │       └── locales/                  ← i18n 字符串
    ├── packages/
    │   ├── adapters/                     ← 智能体 Adapter 包
    │   │   ├── claude-local/
    │   │   ├── codex-local/
    │   │   ├── cursor-local/
    │   │   ├── gemini-local/
    │   │   ├── opencode-local/
    │   │   ├── pi-local/
    │   │   └── openclaw-gateway/
    │   ├── db/                           ← Drizzle Schema + Migrations
    │   ├── shared/                       ← 跨包共享的 Zod 类型
    │   └── adapter-utils/                ← 共享 Adapter 工具函数
    └── AgentSetting/                     ← 智能体规则、技能、提示词
```

---

## 来源与许可证

| 组件 | 上游 | 许可证 |
|---|---|---|
| Paperclip | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT — Copyright (c) 2025 Paperclip AI |
| Browser-Use | [browser-use/browser-use](https://github.com/browser-use/browser-use) | MIT — Copyright (c) 2024 Gregor Zunic |

完整许可证文本：`paperclip-official/LICENSE`。
