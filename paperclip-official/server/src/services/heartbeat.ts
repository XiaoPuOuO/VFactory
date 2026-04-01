import fs from "node:fs/promises";
import path from "node:path";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, not, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import {
  agents,
  agentRuntimeState,
  agentTaskSessions,
  agentWakeupRequests,
  companies,
  goals,
  heartbeatRunEvents,
  heartbeatRuns,
  issues,
  projects,
  projectWorkspaces,
  workflowRuns,
} from "@paperclipai/db";
import { conflict, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { incHeartbeatRunFailure } from "../telemetry/prometheus.js";
import { recordApplicationLog } from "./application-logs.js";
import { publishLiveEvent } from "./live-events.js";
import { getRunLogStore, type RunLogHandle } from "./run-log-store.js";
import { getServerAdapter, runningProcesses } from "../adapters/index.js";
import type { AdapterExecutionResult, AdapterInvocationMeta, AdapterSessionCodec } from "../adapters/index.js";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { parseObject, asBoolean, asNumber, appendWithCap, MAX_EXCERPT_BYTES } from "../adapters/utils.js";
import { budgetPolicyService } from "./budget-policies.js";
import { costService } from "./costs.js";
import { secretService } from "./secrets.js";
import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";
import { summarizeHeartbeatRunResultJson } from "./heartbeat-run-summary.js";
import {
  buildWorkspaceReadyComment,
  ensureRuntimeServicesForRun,
  persistAdapterManagedRuntimeServices,
  realizeExecutionWorkspace,
  releaseRuntimeServicesForRun,
} from "./workspace-runtime.js";
import { buildSkillInjectionPrompt } from "./skill-injection.js";
import {
  attachWorkflowPendingWorkerContext,
  buildWorkflowWorkerContinuationPromptBlock,
  pollUntilWorkflowWorkerStepAdvances,
  type PaperclipWorkflowPendingWorkerContext,
} from "./workflow-heartbeat-bridge.js";
import { loadCompanySkillsForInjection } from "./company-skill-bundle.js";
import { agentMemoriesService } from "./agent-memories.js";
import { issueService } from "./issues.js";
import {
  encodeHeartbeatRunCursor,
  isWithinMaintenanceWindows,
  isWakeupsPausedUntilActive,
  type HeartbeatRun,
  type HeartbeatRunsListResponse,
  type IssueExecutionWorkspaceSettings,
} from "@paperclipai/shared";
import {
  buildExecutionWorkspaceAdapterConfig,
  orderProjectWorkspaceRowsForIssue,
  parseIssueExecutionWorkspaceSettings,
  parseProjectExecutionWorkspacePolicy,
  resolveExecutionWorkspaceMode,
} from "./execution-workspace-policy.js";
import { redactCurrentUserText, redactCurrentUserValue } from "../log-redaction.js";
import { notifyAgentExecutionFailureEmail } from "./agent-execution-failure-email.js";

const MAX_LIVE_LOG_CHUNK_BYTES = 8 * 1024;
const HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT = 10;
const HEARTBEAT_MAX_CONCURRENT_RUNS_MAX = 10;
const DEFERRED_WAKE_CONTEXT_KEY = "_paperclipWakeContext";
const startLocksByAgent = new Map<string, Promise<void>>();
const REPO_ONLY_CWD_SENTINEL = "/__paperclip_repo_only__";
const WORKSPACE_AGENTS_FALLBACK_FILE = "AGENTS.md";
const AGENT_SETTING_DIR = "AgentSetting";
const KNOWN_INSTRUCTIONS_PATH_KEYS = ["instructionsFilePath", "agentsMdPath"] as const;

const heartbeatRunListColumns = {
  id: heartbeatRuns.id,
  companyId: heartbeatRuns.companyId,
  agentId: heartbeatRuns.agentId,
  invocationSource: heartbeatRuns.invocationSource,
  triggerDetail: heartbeatRuns.triggerDetail,
  status: heartbeatRuns.status,
  startedAt: heartbeatRuns.startedAt,
  finishedAt: heartbeatRuns.finishedAt,
  error: heartbeatRuns.error,
  wakeupRequestId: heartbeatRuns.wakeupRequestId,
  exitCode: heartbeatRuns.exitCode,
  signal: heartbeatRuns.signal,
  usageJson: heartbeatRuns.usageJson,
  resultJson: heartbeatRuns.resultJson,
  sessionIdBefore: heartbeatRuns.sessionIdBefore,
  sessionIdAfter: heartbeatRuns.sessionIdAfter,
  logStore: heartbeatRuns.logStore,
  logRef: heartbeatRuns.logRef,
  logBytes: heartbeatRuns.logBytes,
  logSha256: heartbeatRuns.logSha256,
  logCompressed: heartbeatRuns.logCompressed,
  stdoutExcerpt: sql<string | null>`NULL`.as("stdoutExcerpt"),
  stderrExcerpt: sql<string | null>`NULL`.as("stderrExcerpt"),
  errorCode: heartbeatRuns.errorCode,
  externalRunId: heartbeatRuns.externalRunId,
  contextSnapshot: heartbeatRuns.contextSnapshot,
  createdAt: heartbeatRuns.createdAt,
  updatedAt: heartbeatRuns.updatedAt,
} as const;

function appendExcerpt(prev: string, chunk: string) {
  return appendWithCap(prev, chunk, MAX_EXCERPT_BYTES);
}

function normalizeMaxConcurrentRuns(value: unknown) {
  const parsed = Math.floor(asNumber(value, HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT));
  if (!Number.isFinite(parsed)) return HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT;
  return Math.max(HEARTBEAT_MAX_CONCURRENT_RUNS_DEFAULT, Math.min(HEARTBEAT_MAX_CONCURRENT_RUNS_MAX, parsed));
}

async function withAgentStartLock<T>(agentId: string, fn: () => Promise<T>) {
  const previous = startLocksByAgent.get(agentId) ?? Promise.resolve();
  const run = previous.then(fn);
  const marker = run.then(
    () => undefined,
    () => undefined,
  );
  startLocksByAgent.set(agentId, marker);
  try {
    return await run;
  } finally {
    if (startLocksByAgent.get(agentId) === marker) {
      startLocksByAgent.delete(agentId);
    }
  }
}

interface WakeupOptions {
  source?: "timer" | "assignment" | "on_demand" | "automation";
  triggerDetail?: "manual" | "ping" | "callback" | "system" | "scheduled";
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  requestedByActorType?: "user" | "agent" | "system";
  requestedByActorId?: string | null;
  contextSnapshot?: Record<string, unknown>;
}

interface ParsedIssueAssigneeAdapterOverrides {
  adapterConfig: Record<string, unknown> | null;
  useProjectWorkspace: boolean | null;
}

export type ResolvedWorkspaceForRun = {
  cwd: string;
  source: "project_primary" | "task_session" | "agent_home";
  projectId: string | null;
  workspaceId: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  workspaceHints: Array<{
    workspaceId: string;
    cwd: string | null;
    repoUrl: string | null;
    repoRef: string | null;
  }>;
  warnings: string[];
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Issue／任務流程使用 `projectId`；聊天 composer 選專案則寫入 `chatProjectId`（見 chat.ts baseContext）。
 * 工作區解析必須兩者併用，否則會落到 agent 預設目錄而忽略使用者指定之 repo。
 */
export function readContextProjectId(context: Record<string, unknown>): string | null {
  return readNonEmptyString(context.projectId) ?? readNonEmptyString(context.chatProjectId);
}

function withProjectGovernancePromptTemplate(
  existingTemplate: unknown,
  options?: { chatLight?: boolean },
): string {
  const baseTemplate =
    typeof existingTemplate === "string" && existingTemplate.trim().length > 0
      ? existingTemplate
      : "You are agent {{agent.id}} ({{agent.name}}). Continue your VFactory work.";
  const governancePrefix = options?.chatLight
    ? [
        "Project governance (chat, brief): For substantive implementation work, follow AGENTS.md and relevant rules/skills under the workspace AgentSetting directory.",
        "",
      ].join("\n")
    : [
        "Project governance policy (mandatory):",
        "- AGENTS.md is the baseline instruction contract for heartbeat runs.",
        "- If this agent has no dedicated instructions file configured, load and follow workspace AGENTS.md.",
        `- Use project governance assets under ${AGENT_SETTING_DIR}/ (rules, skills, AGENTS.md).`,
        `- For rules under ${AGENT_SETTING_DIR}/rules and skills under ${AGENT_SETTING_DIR}/skills, decide which items are relevant to the task and follow only the relevant ones.`,
        "",
      ].join("\n");
  return `${governancePrefix}${baseTemplate}`;
}

async function resolveWorkspaceAgentsFallbackPath(workspaceCwd: string): Promise<string | null> {
  let cursor = path.resolve(workspaceCwd);
  while (true) {
    const candidates = [
      path.join(cursor, AGENT_SETTING_DIR, WORKSPACE_AGENTS_FALLBACK_FILE),
      path.join(cursor, WORKSPACE_AGENTS_FALLBACK_FILE),
    ];
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // continue with the next candidate
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

async function applyHeartbeatInstructionFallback(
  resolvedConfig: Record<string, unknown>,
  workspaceCwd: string,
): Promise<void> {
  const hasDedicatedInstructions = KNOWN_INSTRUCTIONS_PATH_KEYS.some((key) => {
    const value = resolvedConfig[key];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (hasDedicatedInstructions) return;

  const fallbackPath = await resolveWorkspaceAgentsFallbackPath(workspaceCwd);
  if (fallbackPath) resolvedConfig.instructionsFilePath = fallbackPath;
}

/** 從 run.contextSnapshot 讀出 taskKey，供 live event payload 與 client 判斷是否為聊天觸發。 */
function readTaskKeyFromSnapshot(contextSnapshot: unknown): string | null {
  if (contextSnapshot == null || typeof contextSnapshot !== "object") return null;
  const taskKey = (contextSnapshot as Record<string, unknown>).taskKey;
  return readNonEmptyString(taskKey);
}

export function resolveRuntimeSessionParamsForWorkspace(input: {
  agentId: string;
  previousSessionParams: Record<string, unknown> | null;
  resolvedWorkspace: ResolvedWorkspaceForRun;
}) {
  const { agentId, previousSessionParams, resolvedWorkspace } = input;
  const previousSessionId = readNonEmptyString(previousSessionParams?.sessionId);
  const previousCwd = readNonEmptyString(previousSessionParams?.cwd);
  if (!previousSessionId || !previousCwd) {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }
  if (resolvedWorkspace.source !== "project_primary") {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }
  const projectCwd = readNonEmptyString(resolvedWorkspace.cwd);
  if (!projectCwd) {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }
  const fallbackAgentHomeCwd = resolveDefaultAgentWorkspaceDir(agentId);
  if (path.resolve(previousCwd) !== path.resolve(fallbackAgentHomeCwd)) {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }
  if (path.resolve(projectCwd) === path.resolve(previousCwd)) {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }
  const previousWorkspaceId = readNonEmptyString(previousSessionParams?.workspaceId);
  if (
    previousWorkspaceId &&
    resolvedWorkspace.workspaceId &&
    previousWorkspaceId !== resolvedWorkspace.workspaceId
  ) {
    return {
      sessionParams: previousSessionParams,
      warning: null as string | null,
    };
  }

  const migratedSessionParams: Record<string, unknown> = {
    ...(previousSessionParams ?? {}),
    cwd: projectCwd,
  };
  if (resolvedWorkspace.workspaceId) migratedSessionParams.workspaceId = resolvedWorkspace.workspaceId;
  if (resolvedWorkspace.repoUrl) migratedSessionParams.repoUrl = resolvedWorkspace.repoUrl;
  if (resolvedWorkspace.repoRef) migratedSessionParams.repoRef = resolvedWorkspace.repoRef;

  return {
    sessionParams: migratedSessionParams,
    warning:
      `Project workspace "${projectCwd}" is now available. ` +
      `Attempting to resume session "${previousSessionId}" that was previously saved in fallback workspace "${previousCwd}".`,
  };
}

function parseIssueAssigneeAdapterOverrides(
  raw: unknown,
): ParsedIssueAssigneeAdapterOverrides | null {
  const parsed = parseObject(raw);
  const parsedAdapterConfig = parseObject(parsed.adapterConfig);
  const adapterConfig =
    Object.keys(parsedAdapterConfig).length > 0 ? parsedAdapterConfig : null;
  const useProjectWorkspace =
    typeof parsed.useProjectWorkspace === "boolean"
      ? parsed.useProjectWorkspace
      : null;
  if (!adapterConfig && useProjectWorkspace === null) return null;
  return {
    adapterConfig,
    useProjectWorkspace,
  };
}

function deriveTaskKey(
  contextSnapshot: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | null | undefined,
) {
  return (
    readNonEmptyString(contextSnapshot?.taskKey) ??
    readNonEmptyString(contextSnapshot?.taskId) ??
    readNonEmptyString(contextSnapshot?.issueId) ??
    readNonEmptyString(payload?.taskKey) ??
    readNonEmptyString(payload?.taskId) ??
    readNonEmptyString(payload?.issueId) ??
    null
  );
}

export function shouldResetTaskSessionForWake(
  contextSnapshot: Record<string, unknown> | null | undefined,
) {
  const wakeReason = readNonEmptyString(contextSnapshot?.wakeReason);
  if (wakeReason === "issue_assigned") return true;

  const wakeSource = readNonEmptyString(contextSnapshot?.wakeSource);
  if (wakeSource === "timer") return true;

  const wakeTriggerDetail = readNonEmptyString(contextSnapshot?.wakeTriggerDetail);
  return wakeSource === "on_demand" && wakeTriggerDetail === "manual";
}

function describeSessionResetReason(
  contextSnapshot: Record<string, unknown> | null | undefined,
) {
  const wakeReason = readNonEmptyString(contextSnapshot?.wakeReason);
  if (wakeReason === "issue_assigned") return "wake reason is issue_assigned";

  const wakeSource = readNonEmptyString(contextSnapshot?.wakeSource);
  if (wakeSource === "timer") return "wake source is timer";

  const wakeTriggerDetail = readNonEmptyString(contextSnapshot?.wakeTriggerDetail);
  if (wakeSource === "on_demand" && wakeTriggerDetail === "manual") {
    return "this is a manual invoke";
  }
  return null;
}

function deriveCommentId(
  contextSnapshot: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | null | undefined,
) {
  return (
    readNonEmptyString(contextSnapshot?.wakeCommentId) ??
    readNonEmptyString(contextSnapshot?.commentId) ??
    readNonEmptyString(payload?.commentId) ??
    null
  );
}

function enrichWakeContextSnapshot(input: {
  contextSnapshot: Record<string, unknown>;
  reason: string | null;
  source: WakeupOptions["source"];
  triggerDetail: WakeupOptions["triggerDetail"] | null;
  payload: Record<string, unknown> | null;
}) {
  const { contextSnapshot, reason, source, triggerDetail, payload } = input;
  const issueIdFromPayload = readNonEmptyString(payload?.["issueId"]);
  const commentIdFromPayload = readNonEmptyString(payload?.["commentId"]);
  const taskKey = deriveTaskKey(contextSnapshot, payload);
  const wakeCommentId = deriveCommentId(contextSnapshot, payload);

  if (!readNonEmptyString(contextSnapshot["wakeReason"]) && reason) {
    contextSnapshot.wakeReason = reason;
  }
  if (!readNonEmptyString(contextSnapshot["issueId"]) && issueIdFromPayload) {
    contextSnapshot.issueId = issueIdFromPayload;
  }
  if (!readNonEmptyString(contextSnapshot["taskId"]) && issueIdFromPayload) {
    contextSnapshot.taskId = issueIdFromPayload;
  }
  if (!readNonEmptyString(contextSnapshot["taskKey"]) && taskKey) {
    contextSnapshot.taskKey = taskKey;
  }
  if (!readNonEmptyString(contextSnapshot["commentId"]) && commentIdFromPayload) {
    contextSnapshot.commentId = commentIdFromPayload;
  }
  if (!readNonEmptyString(contextSnapshot["wakeCommentId"]) && wakeCommentId) {
    contextSnapshot.wakeCommentId = wakeCommentId;
  }
  if (!readNonEmptyString(contextSnapshot["wakeSource"]) && source) {
    contextSnapshot.wakeSource = source;
  }
  if (!readNonEmptyString(contextSnapshot["wakeTriggerDetail"]) && triggerDetail) {
    contextSnapshot.wakeTriggerDetail = triggerDetail;
  }

  return {
    contextSnapshot,
    issueIdFromPayload,
    commentIdFromPayload,
    taskKey,
    wakeCommentId,
  };
}

function mergeCoalescedContextSnapshot(
  existingRaw: unknown,
  incoming: Record<string, unknown>,
) {
  const existing = parseObject(existingRaw);
  const merged: Record<string, unknown> = {
    ...existing,
    ...incoming,
  };
  const commentId = deriveCommentId(incoming, null);
  if (commentId) {
    merged.commentId = commentId;
    merged.wakeCommentId = commentId;
  }
  return merged;
}

function runTaskKey(run: typeof heartbeatRuns.$inferSelect) {
  return deriveTaskKey(run.contextSnapshot as Record<string, unknown> | null, null);
}

function isSameTaskScope(left: string | null, right: string | null) {
  return (left ?? null) === (right ?? null);
}

const TERMINAL_ISSUE_STATUSES_FOR_Issue = new Set(["done", "cancelled"]);

/**
 * Issue: 檢查在給定 parent 的 executionPolicy 與 siblings 下，currentIssueId 是否可執行（前序依賴已滿足）。
 */
function canRunIssueWithIssuePolicy(
  currentIssueId: string,
  policy: {
    subtaskExecutionPolicy?: string;
    subtaskExecutionOrder?: string[];
    subtaskPhases?: string[][];
  } | null | undefined,
  siblings: Array<{ id: string; status: string; createdAt: Date; issueNumber: number | null }>,
): boolean {
  if (!policy?.subtaskExecutionPolicy || policy.subtaskExecutionPolicy === "parallel") return true;
  const terminal = TERMINAL_ISSUE_STATUSES_FOR_Issue;
  const byId = new Map(siblings.map((s) => [s.id, s]));

  if (policy.subtaskExecutionPolicy === "sequential") {
    const order =
      (policy.subtaskExecutionOrder?.length ?? 0) > 0
        ? (policy.subtaskExecutionOrder ?? []).filter((id) => byId.has(id))
        : [...siblings]
            .sort((a, b) => (a.issueNumber ?? 0) - (b.issueNumber ?? 0) || a.createdAt.getTime() - b.createdAt.getTime())
            .map((s) => s.id);
    const idx = order.indexOf(currentIssueId);
    if (idx <= 0) return true;
    for (let i = 0; i < idx; i++) {
      const prev = byId.get(order[i]);
      if (!prev || !terminal.has(prev.status)) return false;
    }
    return true;
  }

  if (policy.subtaskExecutionPolicy === "phased") {
    const phases = policy.subtaskPhases ?? [];
    const phaseIndex = phases.findIndex((phase) => phase.includes(currentIssueId));
    if (phaseIndex <= 0) return true;
    const prevPhase = phases[phaseIndex - 1] ?? [];
    for (const prevId of prevPhase) {
      const prev = byId.get(prevId);
      if (!prev || !terminal.has(prev.status)) return false;
    }
    return true;
  }

  return true;
}

function truncateDisplayId(value: string | null | undefined, max = 128) {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function normalizeAgentNameKey(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

const defaultSessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    const asObj = parseObject(raw);
    if (Object.keys(asObj).length > 0) return asObj;
    const sessionId = readNonEmptyString((raw as Record<string, unknown> | null)?.sessionId);
    if (sessionId) return { sessionId };
    return null;
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params || Object.keys(params).length === 0) return null;
    return params;
  },
  getDisplayId(params: Record<string, unknown> | null) {
    return readNonEmptyString(params?.sessionId);
  },
};

function getAdapterSessionCodec(adapterType: string) {
  const adapter = getServerAdapter(adapterType);
  return adapter.sessionCodec ?? defaultSessionCodec;
}

function normalizeSessionParams(params: Record<string, unknown> | null | undefined) {
  if (!params) return null;
  return Object.keys(params).length > 0 ? params : null;
}

function resolveNextSessionState(input: {
  codec: AdapterSessionCodec;
  adapterResult: AdapterExecutionResult;
  previousParams: Record<string, unknown> | null;
  previousDisplayId: string | null;
  previousLegacySessionId: string | null;
}) {
  const { codec, adapterResult, previousParams, previousDisplayId, previousLegacySessionId } = input;

  if (adapterResult.clearSession) {
    return {
      params: null as Record<string, unknown> | null,
      displayId: null as string | null,
      legacySessionId: null as string | null,
    };
  }

  const explicitParams = adapterResult.sessionParams;
  const hasExplicitParams = adapterResult.sessionParams !== undefined;
  const hasExplicitSessionId = adapterResult.sessionId !== undefined;
  const explicitSessionId = readNonEmptyString(adapterResult.sessionId);
  const hasExplicitDisplay = adapterResult.sessionDisplayId !== undefined;
  const explicitDisplayId = readNonEmptyString(adapterResult.sessionDisplayId);
  const shouldUsePrevious = !hasExplicitParams && !hasExplicitSessionId && !hasExplicitDisplay;

  const candidateParams =
    hasExplicitParams
      ? explicitParams
      : hasExplicitSessionId
        ? (explicitSessionId ? { sessionId: explicitSessionId } : null)
        : previousParams;

  const serialized = normalizeSessionParams(codec.serialize(normalizeSessionParams(candidateParams) ?? null));
  const deserialized = normalizeSessionParams(codec.deserialize(serialized));

  const displayId = truncateDisplayId(
    explicitDisplayId ??
      (codec.getDisplayId ? codec.getDisplayId(deserialized) : null) ??
      readNonEmptyString(deserialized?.sessionId) ??
      (shouldUsePrevious ? previousDisplayId : null) ??
      explicitSessionId ??
      (shouldUsePrevious ? previousLegacySessionId : null),
  );

  const legacySessionId =
    explicitSessionId ??
    readNonEmptyString(deserialized?.sessionId) ??
    displayId ??
    (shouldUsePrevious ? previousLegacySessionId : null);

  return {
    params: serialized,
    displayId,
    legacySessionId,
  };
}

export function heartbeatService(db: Db, storage?: StorageService) {
  const runLogStore = getRunLogStore();
  const secretsSvc = secretService(db);
  const issuesSvc = issueService(db);

  async function getAgent(agentId: string) {
    return db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);
  }

  async function getRun(runId: string) {
    return db
      .select()
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);
  }

  async function getRuntimeState(agentId: string) {
    return db
      .select()
      .from(agentRuntimeState)
      .where(eq(agentRuntimeState.agentId, agentId))
      .then((rows) => rows[0] ?? null);
  }

  async function getTaskSession(
    companyId: string,
    agentId: string,
    adapterType: string,
    taskKey: string,
  ) {
    return db
      .select()
      .from(agentTaskSessions)
      .where(
        and(
          eq(agentTaskSessions.companyId, companyId),
          eq(agentTaskSessions.agentId, agentId),
          eq(agentTaskSessions.adapterType, adapterType),
          eq(agentTaskSessions.taskKey, taskKey),
        ),
      )
      .then((rows) => rows[0] ?? null);
  }

  async function resolveSessionBeforeForWakeup(
    agent: typeof agents.$inferSelect,
    taskKey: string | null,
  ) {
    if (taskKey) {
      const codec = getAdapterSessionCodec(agent.adapterType);
      const existingTaskSession = await getTaskSession(
        agent.companyId,
        agent.id,
        agent.adapterType,
        taskKey,
      );
      const parsedParams = normalizeSessionParams(
        codec.deserialize(existingTaskSession?.sessionParamsJson ?? null),
      );
      return truncateDisplayId(
        existingTaskSession?.sessionDisplayId ??
          (codec.getDisplayId ? codec.getDisplayId(parsedParams) : null) ??
          readNonEmptyString(parsedParams?.sessionId),
      );
    }

    const runtimeForRun = await getRuntimeState(agent.id);
    return runtimeForRun?.sessionId ?? null;
  }

  async function resolveWorkspaceForRun(
    agent: typeof agents.$inferSelect,
    context: Record<string, unknown>,
    previousSessionParams: Record<string, unknown> | null,
    opts?: {
      useProjectWorkspace?: boolean | null;
      issueExecutionWorkspaceSettings?: IssueExecutionWorkspaceSettings | null;
    },
  ): Promise<ResolvedWorkspaceForRun> {
    const issueId = readNonEmptyString(context.issueId);
    const issueProjectId = issueId
      ? await db
          .select({ projectId: issues.projectId })
          .from(issues)
          .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
          .then((rows) => rows[0]?.projectId ?? null)
      : null;
    const resolvedProjectId = issueProjectId ?? readContextProjectId(context);
    const useProjectWorkspace = opts?.useProjectWorkspace !== false;
    const workspaceProjectId = useProjectWorkspace ? resolvedProjectId : null;

    const projectWorkspaceRows = workspaceProjectId
      ? await db
          .select()
          .from(projectWorkspaces)
          .where(
            and(
              eq(projectWorkspaces.companyId, agent.companyId),
              eq(projectWorkspaces.projectId, workspaceProjectId),
            ),
          )
          .orderBy(asc(projectWorkspaces.createdAt), asc(projectWorkspaces.id))
      : [];

    const preferredWorkspaceId = readNonEmptyString(
      opts?.issueExecutionWorkspaceSettings?.projectWorkspaceId,
    );
    const { ordered: orderedProjectWorkspaceRows, preferredMissingFromProject } =
      orderProjectWorkspaceRowsForIssue(projectWorkspaceRows, preferredWorkspaceId);

    const workspaceHints = projectWorkspaceRows.map((workspace) => ({
      workspaceId: workspace.id,
      cwd: readNonEmptyString(workspace.cwd),
      repoUrl: readNonEmptyString(workspace.repoUrl),
      repoRef: readNonEmptyString(workspace.repoRef),
    }));

    if (projectWorkspaceRows.length > 0) {
      const initialWarnings: string[] = [];
      if (preferredMissingFromProject && preferredWorkspaceId) {
        initialWarnings.push(
          `Issue's project workspace "${preferredWorkspaceId}" is not linked to this project. Trying project workspaces in default order.`,
        );
      }

      const missingProjectCwds: string[] = [];
      let hasConfiguredProjectCwd = false;
      let preferredSkippedUnavailable = false;

      for (const workspace of orderedProjectWorkspaceRows) {
        const projectCwd = readNonEmptyString(workspace.cwd);
        if (!projectCwd || projectCwd === REPO_ONLY_CWD_SENTINEL) {
          if (preferredWorkspaceId && workspace.id === preferredWorkspaceId) {
            preferredSkippedUnavailable = true;
          }
          continue;
        }
        hasConfiguredProjectCwd = true;
        const projectCwdExists = await fs
          .stat(projectCwd)
          .then((stats) => stats.isDirectory())
          .catch(() => false);
        if (projectCwdExists) {
          const warnings = [...initialWarnings];
          if (
            preferredWorkspaceId &&
            workspace.id !== preferredWorkspaceId &&
            preferredSkippedUnavailable
          ) {
            warnings.push(
              `Preferred project workspace is not available on this host. Using "${projectCwd}" instead.`,
            );
          }
          return {
            cwd: projectCwd,
            source: "project_primary" as const,
            projectId: resolvedProjectId,
            workspaceId: workspace.id,
            repoUrl: workspace.repoUrl,
            repoRef: workspace.repoRef,
            workspaceHints,
            warnings,
          };
        }
        if (preferredWorkspaceId && workspace.id === preferredWorkspaceId) {
          preferredSkippedUnavailable = true;
        }
        missingProjectCwds.push(projectCwd);
      }

      const fallbackCwd = resolveDefaultAgentWorkspaceDir(agent.id);
      await fs.mkdir(fallbackCwd, { recursive: true });
      const warnings = [...initialWarnings];
      if (missingProjectCwds.length > 0) {
        const firstMissing = missingProjectCwds[0];
        const extraMissingCount = Math.max(0, missingProjectCwds.length - 1);
        warnings.push(
          extraMissingCount > 0
            ? `Project workspace path "${firstMissing}" and ${extraMissingCount} other configured path(s) are not available yet. Using fallback workspace "${fallbackCwd}" for this run.`
            : `Project workspace path "${firstMissing}" is not available yet. Using fallback workspace "${fallbackCwd}" for this run.`,
        );
      } else if (!hasConfiguredProjectCwd) {
        warnings.push(
          `Project workspace has no local cwd configured. Using fallback workspace "${fallbackCwd}" for this run.`,
        );
      }
      return {
        cwd: fallbackCwd,
        source: "project_primary" as const,
        projectId: resolvedProjectId,
        workspaceId: orderedProjectWorkspaceRows[0]?.id ?? null,
        repoUrl: orderedProjectWorkspaceRows[0]?.repoUrl ?? null,
        repoRef: orderedProjectWorkspaceRows[0]?.repoRef ?? null,
        workspaceHints,
        warnings,
      };
    }

    const sessionCwd = readNonEmptyString(previousSessionParams?.cwd);
    if (sessionCwd) {
      const sessionCwdExists = await fs
        .stat(sessionCwd)
        .then((stats) => stats.isDirectory())
        .catch(() => false);
      if (sessionCwdExists) {
        return {
          cwd: sessionCwd,
          source: "task_session" as const,
          projectId: resolvedProjectId,
          workspaceId: readNonEmptyString(previousSessionParams?.workspaceId),
          repoUrl: readNonEmptyString(previousSessionParams?.repoUrl),
          repoRef: readNonEmptyString(previousSessionParams?.repoRef),
          workspaceHints,
          warnings: [],
        };
      }
    }

    const cwd = resolveDefaultAgentWorkspaceDir(agent.id);
    await fs.mkdir(cwd, { recursive: true });
    const warnings: string[] = [];
    if (sessionCwd) {
      warnings.push(
        `Saved session workspace "${sessionCwd}" is not available. Using fallback workspace "${cwd}" for this run.`,
      );
    } else if (resolvedProjectId) {
      warnings.push(
        `No project workspace directory is currently available for this issue. Using fallback workspace "${cwd}" for this run.`,
      );
    } else {
      warnings.push(
        `No project or prior session workspace was available. Using fallback workspace "${cwd}" for this run.`,
      );
    }
    return {
      cwd,
      source: "agent_home" as const,
      projectId: resolvedProjectId,
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      workspaceHints,
      warnings,
    };
  }

  async function upsertTaskSession(input: {
    companyId: string;
    agentId: string;
    adapterType: string;
    taskKey: string;
    sessionParamsJson: Record<string, unknown> | null;
    sessionDisplayId: string | null;
    lastRunId: string | null;
    lastError: string | null;
  }) {
    const existing = await getTaskSession(
      input.companyId,
      input.agentId,
      input.adapterType,
      input.taskKey,
    );
    if (existing) {
      return db
        .update(agentTaskSessions)
        .set({
          sessionParamsJson: input.sessionParamsJson,
          sessionDisplayId: input.sessionDisplayId,
          lastRunId: input.lastRunId,
          lastError: input.lastError,
          updatedAt: new Date(),
        })
        .where(eq(agentTaskSessions.id, existing.id))
        .returning()
        .then((rows) => rows[0] ?? null);
    }

    return db
      .insert(agentTaskSessions)
      .values({
        companyId: input.companyId,
        agentId: input.agentId,
        adapterType: input.adapterType,
        taskKey: input.taskKey,
        sessionParamsJson: input.sessionParamsJson,
        sessionDisplayId: input.sessionDisplayId,
        lastRunId: input.lastRunId,
        lastError: input.lastError,
      })
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function clearTaskSessions(
    companyId: string,
    agentId: string,
    opts?: { taskKey?: string | null; adapterType?: string | null },
  ) {
    const conditions = [
      eq(agentTaskSessions.companyId, companyId),
      eq(agentTaskSessions.agentId, agentId),
    ];
    if (opts?.taskKey) {
      conditions.push(eq(agentTaskSessions.taskKey, opts.taskKey));
    }
    if (opts?.adapterType) {
      conditions.push(eq(agentTaskSessions.adapterType, opts.adapterType));
    }

    return db
      .delete(agentTaskSessions)
      .where(and(...conditions))
      .returning()
      .then((rows) => rows.length);
  }

  async function ensureRuntimeState(agent: typeof agents.$inferSelect) {
    const existing = await getRuntimeState(agent.id);
    if (existing) return existing;

    return db
      .insert(agentRuntimeState)
      .values({
        agentId: agent.id,
        companyId: agent.companyId,
        adapterType: agent.adapterType,
        stateJson: {},
      })
      .returning()
      .then((rows) => rows[0]);
  }

  async function setRunStatus(
    runId: string,
    status: string,
    patch?: Partial<typeof heartbeatRuns.$inferInsert>,
  ) {
    const updated = await db
      .update(heartbeatRuns)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(eq(heartbeatRuns.id, runId))
      .returning()
      .then((rows) => rows[0] ?? null);

    if (updated) {
      const taskKey = readTaskKeyFromSnapshot(updated.contextSnapshot);
      publishLiveEvent({
        companyId: updated.companyId,
        type: "heartbeat.run.status",
        payload: {
          runId: updated.id,
          agentId: updated.agentId,
          status: updated.status,
          invocationSource: updated.invocationSource,
          triggerDetail: updated.triggerDetail,
          error: updated.error ?? null,
          errorCode: updated.errorCode ?? null,
          startedAt: updated.startedAt ? new Date(updated.startedAt).toISOString() : null,
          finishedAt: updated.finishedAt ? new Date(updated.finishedAt).toISOString() : null,
          ...(taskKey ? { taskKey } : {}),
        },
      });

      // Scheduled automation runs are the primary "batch" channel; failures are actionable and should notify owners automatically.
      if (updated.status === "failed" || updated.status === "timed_out") {
        incHeartbeatRunFailure(updated.invocationSource ?? "unknown");
      }

      if (
        (updated.status === "failed" || updated.status === "timed_out") &&
        updated.invocationSource === "automation" &&
        updated.triggerDetail === "scheduled"
      ) {
        void notifyAgentExecutionFailureEmail(db, {
          id: updated.id,
          companyId: updated.companyId,
          agentId: updated.agentId,
          invocationSource: updated.invocationSource ?? null,
          triggerDetail: updated.triggerDetail ?? null,
          status: updated.status,
          errorCode: updated.errorCode ?? null,
          finishedAt: updated.finishedAt ?? null,
        }).catch((err) => {
          logger.warn(
            { err, runId: updated.id, companyId: updated.companyId, agentId: updated.agentId },
            "agent execution failure email notification failed",
          );
        });
      }
    }

    return updated;
  }

  async function setWakeupStatus(
    wakeupRequestId: string | null | undefined,
    status: string,
    patch?: Partial<typeof agentWakeupRequests.$inferInsert>,
  ) {
    if (!wakeupRequestId) return;
    await db
      .update(agentWakeupRequests)
      .set({ status, ...patch, updatedAt: new Date() })
      .where(eq(agentWakeupRequests.id, wakeupRequestId));
  }

  async function appendRunEvent(
    run: typeof heartbeatRuns.$inferSelect,
    seq: number,
    event: {
      eventType: string;
      stream?: "system" | "stdout" | "stderr";
      level?: "info" | "warn" | "error";
      color?: string;
      message?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const sanitizedMessage = event.message ? redactCurrentUserText(event.message) : event.message;
    const sanitizedPayload = event.payload ? redactCurrentUserValue(event.payload) : event.payload;

    await db.insert(heartbeatRunEvents).values({
      companyId: run.companyId,
      runId: run.id,
      agentId: run.agentId,
      seq,
      eventType: event.eventType,
      stream: event.stream,
      level: event.level,
      color: event.color,
      message: sanitizedMessage,
      payload: sanitizedPayload,
    });

    publishLiveEvent({
      companyId: run.companyId,
      type: "heartbeat.run.event",
      payload: {
        runId: run.id,
        agentId: run.agentId,
        seq,
        eventType: event.eventType,
        stream: event.stream ?? null,
        level: event.level ?? null,
        color: event.color ?? null,
        message: sanitizedMessage ?? null,
        payload: sanitizedPayload ?? null,
      },
    });
  }

  function parseHeartbeatPolicy(agent: typeof agents.$inferSelect) {
    const runtimeConfig = parseObject(agent.runtimeConfig);
    const heartbeat = parseObject(runtimeConfig.heartbeat);

    return {
      enabled: asBoolean(heartbeat.enabled, true),
      intervalSec: Math.max(0, asNumber(heartbeat.intervalSec, 0)),
      wakeOnDemand: asBoolean(heartbeat.wakeOnDemand ?? heartbeat.wakeOnAssignment ?? heartbeat.wakeOnOnDemand ?? heartbeat.wakeOnAutomation, true),
      maxConcurrentRuns: normalizeMaxConcurrentRuns(heartbeat.maxConcurrentRuns),
    };
  }

  async function countRunningRunsForAgent(agentId: string) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.agentId, agentId), eq(heartbeatRuns.status, "running")));
    return Number(count ?? 0);
  }

  async function claimQueuedRun(run: typeof heartbeatRuns.$inferSelect) {
    if (run.status !== "queued") return run;
    const claimedAt = new Date();
    const claimed = await db
      .update(heartbeatRuns)
      .set({
        status: "running",
        startedAt: run.startedAt ?? claimedAt,
        updatedAt: claimedAt,
      })
      .where(and(eq(heartbeatRuns.id, run.id), eq(heartbeatRuns.status, "queued")))
      .returning()
      .then((rows) => rows[0] ?? null);
    if (!claimed) return null;

    const taskKey = readTaskKeyFromSnapshot(claimed.contextSnapshot);
    publishLiveEvent({
      companyId: claimed.companyId,
      type: "heartbeat.run.status",
      payload: {
        runId: claimed.id,
        agentId: claimed.agentId,
        status: claimed.status,
        invocationSource: claimed.invocationSource,
        triggerDetail: claimed.triggerDetail,
        error: claimed.error ?? null,
        errorCode: claimed.errorCode ?? null,
        startedAt: claimed.startedAt ? new Date(claimed.startedAt).toISOString() : null,
        finishedAt: claimed.finishedAt ? new Date(claimed.finishedAt).toISOString() : null,
        ...(taskKey ? { taskKey } : {}),
      },
    });

    await setWakeupStatus(claimed.wakeupRequestId, "claimed", { claimedAt });
    return claimed;
  }

  async function finalizeAgentStatus(
    agentId: string,
    outcome: "succeeded" | "failed" | "cancelled" | "timed_out",
  ) {
    const existing = await getAgent(agentId);
    if (!existing) return;

    if (existing.status === "paused" || existing.status === "terminated") {
      return;
    }

    const runningCount = await countRunningRunsForAgent(agentId);
    const nextStatus =
      runningCount > 0
        ? "running"
        : outcome === "succeeded" || outcome === "cancelled"
          ? "idle"
          : "error";

    const updated = await db
      .update(agents)
      .set({
        status: nextStatus,
        lastHeartbeatAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId))
      .returning()
      .then((rows) => rows[0] ?? null);

    if (updated) {
      publishLiveEvent({
        companyId: updated.companyId,
        type: "agent.status",
        payload: {
          agentId: updated.id,
          status: updated.status,
          lastHeartbeatAt: updated.lastHeartbeatAt
            ? new Date(updated.lastHeartbeatAt).toISOString()
            : null,
          outcome,
        },
      });
    }
  }

  async function reapOrphanedRuns(opts?: { staleThresholdMs?: number }) {
    const staleThresholdMs = opts?.staleThresholdMs ?? 0;
    const now = new Date();

    // Find all runs in "queued" or "running" state
    const activeRuns = await db
      .select()
      .from(heartbeatRuns)
      .where(inArray(heartbeatRuns.status, ["queued", "running"]));

    const reaped: string[] = [];
    const reapedByCompany = new Map<string, string[]>();

    for (const run of activeRuns) {
      if (runningProcesses.has(run.id)) continue;

      // Apply staleness threshold to avoid false positives
      if (staleThresholdMs > 0) {
        const refTime = run.updatedAt ? new Date(run.updatedAt).getTime() : 0;
        if (now.getTime() - refTime < staleThresholdMs) continue;
      }

      await setRunStatus(run.id, "failed", {
        error: "Process lost -- server may have restarted",
        errorCode: "process_lost",
        finishedAt: now,
      });
      await setWakeupStatus(run.wakeupRequestId, "failed", {
        finishedAt: now,
        error: "Process lost -- server may have restarted",
      });
      const updatedRun = await getRun(run.id);
      if (updatedRun) {
        await appendRunEvent(updatedRun, 1, {
          eventType: "lifecycle",
          stream: "system",
          level: "error",
          message: "Process lost -- server may have restarted",
        });
        await releaseIssueExecutionAndPromote(updatedRun);
      }
      await finalizeAgentStatus(run.agentId, "failed");
      await startNextQueuedRunForAgent(run.agentId);
      runningProcesses.delete(run.id);
      reaped.push(run.id);
      const list = reapedByCompany.get(run.companyId) ?? [];
      list.push(run.id);
      reapedByCompany.set(run.companyId, list);
    }

    if (reaped.length > 0) {
      logger.warn({ reapedCount: reaped.length, runIds: reaped }, "reaped orphaned heartbeat runs");
      if (process.env.PAPERCLIP_WATCHDOG_ESCALATION_ISSUES === "true" && reapedByCompany.size > 0) {
        const issuesApi = issueService(db);
        for (const [companyId, runIds] of reapedByCompany) {
          try {
            await issuesApi.create(companyId, {
              title: `[Watchdog] Orphaned heartbeat runs reaped (${runIds.length})`,
              description: [
                "Server reaped queued/running runs that had no live process (e.g. after restart).",
                "",
                "Run ids:",
                ...runIds.map((id) => `- \`${id}\``),
              ].join("\n"),
              status: "todo",
              priority: "high",
              executionLabel: `watchdog:reap:${Date.now()}:${companyId.slice(0, 8)}`,
            });
          } catch (err) {
            logger.warn({ err, companyId }, "watchdog escalation issue create failed");
          }
        }
      }
      void recordApplicationLog(db, {
        level: "error",
        message: `Reaped ${reaped.length} orphaned heartbeat run(s) (process lost)`,
        context: { runIds: reaped },
        companyId: null,
      }).catch((err) => {
        logger.warn({ err }, "application log write failed after reap");
      });
    }
    return { reaped: reaped.length, runIds: reaped };
  }

  async function updateRuntimeState(
    agent: typeof agents.$inferSelect,
    run: typeof heartbeatRuns.$inferSelect,
    result: AdapterExecutionResult,
    session: { legacySessionId: string | null },
  ) {
    await ensureRuntimeState(agent);
    const usage = result.usage;
    const runUsage = (run.usageJson ?? {}) as Record<string, unknown>;
    const inputTokens = usage?.inputTokens ?? (Number(runUsage.inputTokens) || 0);
    const outputTokens = usage?.outputTokens ?? (Number(runUsage.outputTokens) || 0);
    const cachedInputTokens = usage?.cachedInputTokens ?? (Number(runUsage.cachedInputTokens) || 0);
    const cachedReadTokens = usage?.cacheReadTokens ?? (Number(runUsage.cacheReadTokens) || 0);
    const cachedWriteTokens = usage?.cacheWriteTokens ?? (Number(runUsage.cacheWriteTokens) || 0);
    const costUsdFromRun =
      typeof runUsage.costUsd === "number"
        ? runUsage.costUsd
        : Number(runUsage.costUsd) || 0;
    const additionalCostCents = Math.max(
      0,
      Math.round((result.costUsd ?? costUsdFromRun ?? 0) * 100),
    );
    const hasTokenUsage =
      inputTokens > 0 ||
      outputTokens > 0 ||
      cachedInputTokens > 0 ||
      cachedReadTokens > 0 ||
      cachedWriteTokens > 0;

    await db
      .update(agentRuntimeState)
      .set({
        adapterType: agent.adapterType,
        sessionId: session.legacySessionId,
        lastRunId: run.id,
        lastRunStatus: run.status,
        lastError: result.errorMessage ?? null,
        totalInputTokens: sql`${agentRuntimeState.totalInputTokens} + ${inputTokens}`,
        totalOutputTokens: sql`${agentRuntimeState.totalOutputTokens} + ${outputTokens}`,
        totalCachedInputTokens: sql`${agentRuntimeState.totalCachedInputTokens} + ${cachedInputTokens}`,
        totalCacheReadTokens: sql`${agentRuntimeState.totalCacheReadTokens} + ${cachedReadTokens}`,
        totalCacheWriteTokens: sql`${agentRuntimeState.totalCacheWriteTokens} + ${cachedWriteTokens}`,
        totalCostCents: sql`${agentRuntimeState.totalCostCents} + ${additionalCostCents}`,
        updatedAt: new Date(),
      })
      .where(eq(agentRuntimeState.agentId, agent.id));

    if (additionalCostCents > 0 || hasTokenUsage) {
      const costs = costService(db);
      await costs.createEvent(agent.companyId, {
        agentId: agent.id,
        provider: result.provider ?? "unknown",
        model: result.model ?? "unknown",
        inputTokens,
        outputTokens,
        cachedReadTokens,
        cachedWriteTokens,
        costCents: additionalCostCents,
        occurredAt: new Date(),
      });
    }
  }

  async function startNextQueuedRunForAgent(agentId: string) {
    return withAgentStartLock(agentId, async () => {
      const agent = await getAgent(agentId);
      if (!agent) return [];
      const policy = parseHeartbeatPolicy(agent);
      const runningCount = await countRunningRunsForAgent(agentId);
      const availableSlots = Math.max(0, policy.maxConcurrentRuns - runningCount);
      if (availableSlots <= 0) return [];

      const queuedRuns = await db
        .select()
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.agentId, agentId), eq(heartbeatRuns.status, "queued")))
        .orderBy(asc(heartbeatRuns.createdAt))
        .limit(availableSlots);
      if (queuedRuns.length === 0) return [];

      const claimedRuns: Array<typeof heartbeatRuns.$inferSelect> = [];
      for (const queuedRun of queuedRuns) {
        const claimed = await claimQueuedRun(queuedRun);
        if (claimed) claimedRuns.push(claimed);
      }
      if (claimedRuns.length === 0) return [];

      for (const claimedRun of claimedRuns) {
        void executeRun(claimedRun.id).catch((err) => {
          logger.error({ err, runId: claimedRun.id }, "queued heartbeat execution failed");
        });
      }
      return claimedRuns;
    });
  }

  async function executeRun(runId: string) {
    let run = await getRun(runId);
    if (!run) return;
    if (run.status !== "queued" && run.status !== "running") return;

    if (run.status === "queued") {
      const claimed = await claimQueuedRun(run);
      if (!claimed) {
        // Another worker has already claimed or finalized this run.
        return;
      }
      run = claimed;
    }

    const agent = await getAgent(run.agentId);
    if (!agent) {
      await setRunStatus(runId, "failed", {
        error: "Agent not found",
        errorCode: "agent_not_found",
        finishedAt: new Date(),
      });
      await setWakeupStatus(run.wakeupRequestId, "failed", {
        finishedAt: new Date(),
        error: "Agent not found",
      });
      const failedRun = await getRun(runId);
      if (failedRun) await releaseIssueExecutionAndPromote(failedRun);
      return;
    }

    const runtime = await ensureRuntimeState(agent);
    const context = parseObject(run.contextSnapshot);
    const taskKey = deriveTaskKey(context, null);
    const sessionCodec = getAdapterSessionCodec(agent.adapterType);
    const issueId = readNonEmptyString(context.issueId);
    const contextProjectForLight = readContextProjectId(context);
    const isChatLightMode =
      readNonEmptyString(context.chatMode) === "light" &&
      !readNonEmptyString(context.issueId) &&
      !contextProjectForLight;
    const issueAssigneeConfig = issueId
      ? await db
          .select({
            projectId: issues.projectId,
            assigneeAgentId: issues.assigneeAgentId,
            assigneeAdapterOverrides: issues.assigneeAdapterOverrides,
            executionWorkspaceSettings: issues.executionWorkspaceSettings,
          })
          .from(issues)
          .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
          .then((rows) => rows[0] ?? null)
      : null;
    const issueAssigneeOverrides =
      issueAssigneeConfig && issueAssigneeConfig.assigneeAgentId === agent.id
        ? parseIssueAssigneeAdapterOverrides(
            issueAssigneeConfig.assigneeAdapterOverrides,
          )
        : null;
    const issueExecutionWorkspaceSettings = parseIssueExecutionWorkspaceSettings(
      issueAssigneeConfig?.executionWorkspaceSettings,
    );
    const contextProjectId = readContextProjectId(context);
    const executionProjectId = issueAssigneeConfig?.projectId ?? contextProjectId;
    const projectExecutionWorkspacePolicy = executionProjectId
      ? await db
          .select({ executionWorkspacePolicy: projects.executionWorkspacePolicy })
          .from(projects)
          .where(and(eq(projects.id, executionProjectId), eq(projects.companyId, agent.companyId)))
          .then((rows) => parseProjectExecutionWorkspacePolicy(rows[0]?.executionWorkspacePolicy))
      : null;
    const taskSession = taskKey
      ? await getTaskSession(agent.companyId, agent.id, agent.adapterType, taskKey)
      : null;
    const resetTaskSession = shouldResetTaskSessionForWake(context);
    const sessionResetReason = describeSessionResetReason(context);
    const taskSessionForRun = resetTaskSession ? null : taskSession;
    const previousSessionParams = normalizeSessionParams(
      sessionCodec.deserialize(taskSessionForRun?.sessionParamsJson ?? null),
    );
    const config = parseObject(agent.adapterConfig) as Record<string, unknown>;
    // 輕量聊天模式下，強制使用 project_primary 策略，避免觸發 git worktree 等重型 workspace 操作。
    if (isChatLightMode) {
      const rawStrategy = parseObject(config.workspaceStrategy);
      if (Object.keys(rawStrategy).length > 0) {
        config.workspaceStrategy = {
          ...rawStrategy,
          type: "project_primary",
        };
      }
    }
    const executionWorkspaceMode = resolveExecutionWorkspaceMode({
      projectPolicy: projectExecutionWorkspacePolicy,
      issueSettings: issueExecutionWorkspaceSettings,
      legacyUseProjectWorkspace: issueAssigneeOverrides?.useProjectWorkspace ?? null,
    });
    const resolvedWorkspace = await resolveWorkspaceForRun(
      agent,
      context,
      previousSessionParams,
      {
        useProjectWorkspace: executionWorkspaceMode !== "agent_default",
        issueExecutionWorkspaceSettings,
      },
    );
    const workspaceManagedConfig = buildExecutionWorkspaceAdapterConfig({
      agentConfig: config,
      projectPolicy: projectExecutionWorkspacePolicy,
      issueSettings: issueExecutionWorkspaceSettings,
      mode: executionWorkspaceMode,
      legacyUseProjectWorkspace: issueAssigneeOverrides?.useProjectWorkspace ?? null,
    });
    const mergedConfig = issueAssigneeOverrides?.adapterConfig
      ? { ...workspaceManagedConfig, ...issueAssigneeOverrides.adapterConfig }
      : workspaceManagedConfig;
    // 同一個 Agent 的多個執行（如 Frontend-A、Frontend-B）一律使用該 Agent 的 model，不讓 issue 層級的 assigneeAdapterOverrides 覆寫
    if (Object.prototype.hasOwnProperty.call(workspaceManagedConfig, "model")) {
      mergedConfig.model = workspaceManagedConfig.model;
    }
    const { config: resolvedConfig, secretKeys } = await secretsSvc.resolveAdapterConfigForRuntime(
      agent.companyId,
      mergedConfig,
    );
    const issueRef = issueId
      ? await db
          .select({
            id: issues.id,
            identifier: issues.identifier,
            title: issues.title,
          })
          .from(issues)
          .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
          .then((rows) => rows[0] ?? null)
      : null;
    const executionWorkspace = await realizeExecutionWorkspace({
      base: {
        baseCwd: resolvedWorkspace.cwd,
        source: resolvedWorkspace.source,
        projectId: resolvedWorkspace.projectId,
        workspaceId: resolvedWorkspace.workspaceId,
        repoUrl: resolvedWorkspace.repoUrl,
        repoRef: resolvedWorkspace.repoRef,
      },
      config: resolvedConfig,
      issue: issueRef,
      agent: {
        id: agent.id,
        name: agent.name,
        companyId: agent.companyId,
      },
    });
    await applyHeartbeatInstructionFallback(resolvedConfig, executionWorkspace.cwd);
    resolvedConfig.promptTemplate = withProjectGovernancePromptTemplate(resolvedConfig.promptTemplate, {
      chatLight: isChatLightMode,
    });

    // Skill injection (active/passive):
    // - passive skills are injected on every heartbeat
    // - active skills are injected only when the wake context contains `/skillname ...` invocations
    const companySkills = storage
      ? await loadCompanySkillsForInjection({
          db,
          storage,
          companyId: agent.companyId,
        }).then((rows) => rows.map((r) => r.frontmatter))
      : null;

    const skillInjection = await buildSkillInjectionPrompt({
      workspaceCwd: executionWorkspace.cwd,
      context,
      agentId: agent.id,
      companyId: agent.companyId,
      companySkills,
      chatLightMode: isChatLightMode,
    }).catch((err) => {
      logger.warn({ err, agentId: agent.id }, "skill injection failed");
      return null;
    });
    if (skillInjection && skillInjection.trim().length > 0) {
      resolvedConfig.promptTemplate = `${skillInjection}\n\n${resolvedConfig.promptTemplate}`;
    }

    const basePromptTemplate = resolvedConfig.promptTemplate;

    const runtimeSessionResolution = resolveRuntimeSessionParamsForWorkspace({
      agentId: agent.id,
      previousSessionParams,
      resolvedWorkspace: {
        ...resolvedWorkspace,
        cwd: executionWorkspace.cwd,
      },
    });
    const runtimeSessionParams = runtimeSessionResolution.sessionParams;
    const runtimeWorkspaceWarnings = [
      ...resolvedWorkspace.warnings,
      ...executionWorkspace.warnings,
      ...(runtimeSessionResolution.warning ? [runtimeSessionResolution.warning] : []),
      ...(resetTaskSession && sessionResetReason
        ? [
            taskKey
              ? `Skipping saved session resume for task "${taskKey}" because ${sessionResetReason}.`
              : `Skipping saved session resume because ${sessionResetReason}.`,
          ]
        : []),
    ];
    context.paperclipWorkspace = {
      cwd: executionWorkspace.cwd,
      source: executionWorkspace.source,
      mode: executionWorkspaceMode,
      strategy: executionWorkspace.strategy,
      projectId: executionWorkspace.projectId,
      workspaceId: executionWorkspace.workspaceId,
      repoUrl: executionWorkspace.repoUrl,
      repoRef: executionWorkspace.repoRef,
      branchName: executionWorkspace.branchName,
      worktreePath: executionWorkspace.worktreePath,
    };
    context.paperclipWorkspaces = resolvedWorkspace.workspaceHints;
    const runtimeServiceIntents = isChatLightMode
      ? []
      : (() => {
          const runtimeConfig = parseObject(resolvedConfig.workspaceRuntime);
          return Array.isArray(runtimeConfig.services)
            ? runtimeConfig.services.filter(
                (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
              )
            : [];
        })();
    if (runtimeServiceIntents.length > 0) {
      context.paperclipRuntimeServiceIntents = runtimeServiceIntents;
    } else {
      delete context.paperclipRuntimeServiceIntents;
    }
    if (executionWorkspace.projectId && !readContextProjectId(context)) {
      context.projectId = executionWorkspace.projectId;
    }
    const companyRow = await db
      .select({
        id: companies.id,
        name: companies.name,
        description: companies.description,
        issuePrefix: companies.issuePrefix,
      })
      .from(companies)
      .where(eq(companies.id, agent.companyId))
      .then((rows) => rows[0] ?? null);
    context.paperclipCompany = companyRow
      ? {
          id: companyRow.id,
          name: companyRow.name,
          description: companyRow.description ?? null,
          issuePrefix: companyRow.issuePrefix,
        }
      : { id: agent.companyId, name: "", description: null, issuePrefix: "PAP" };

    const companyProjectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
      })
      .from(projects)
      .where(and(eq(projects.companyId, agent.companyId), isNull(projects.archivedAt)))
      .orderBy(asc(projects.name), asc(projects.id));

    context.paperclipCompanyProjects = companyProjectRows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
    }));
    const runtimeSessionFallback = taskKey || resetTaskSession ? null : runtime.sessionId;
    const previousSessionDisplayId = truncateDisplayId(
      taskSessionForRun?.sessionDisplayId ??
        (sessionCodec.getDisplayId ? sessionCodec.getDisplayId(runtimeSessionParams) : null) ??
        readNonEmptyString(runtimeSessionParams?.sessionId) ??
        runtimeSessionFallback,
    );
    let runtimeForAdapter = {
      sessionId: readNonEmptyString(runtimeSessionParams?.sessionId) ?? runtimeSessionFallback,
      sessionParams: runtimeSessionParams,
      sessionDisplayId: previousSessionDisplayId,
      taskKey,
    };

    let seq = 1;
    let handle: RunLogHandle | null = null;
    let stdoutExcerpt = "";
    let stderrExcerpt = "";
    try {
      const startedAt = run.startedAt ?? new Date();
      const runningWithSession = await db
        .update(heartbeatRuns)
        .set({
          startedAt,
          sessionIdBefore: runtimeForAdapter.sessionDisplayId ?? runtimeForAdapter.sessionId,
          contextSnapshot: context,
          updatedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, run.id))
        .returning()
        .then((rows) => rows[0] ?? null);
      if (runningWithSession) run = runningWithSession;

      const runningAgent = await db
        .update(agents)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (runningAgent) {
        const taskKey = readTaskKeyFromSnapshot(run.contextSnapshot);
        publishLiveEvent({
          companyId: runningAgent.companyId,
          type: "agent.status",
          payload: {
            agentId: runningAgent.id,
            status: runningAgent.status,
            outcome: "running",
            ...(taskKey ? { taskKey } : {}),
          },
        });
      }

      const currentRun = run;
      await appendRunEvent(currentRun, seq++, {
        eventType: "lifecycle",
        stream: "system",
        level: "info",
        message: "run started",
      });

      handle = await runLogStore.begin({
        companyId: run.companyId,
        agentId: run.agentId,
        runId,
      });

      await db
        .update(heartbeatRuns)
        .set({
          logStore: handle.store,
          logRef: handle.logRef,
          updatedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, runId));

      const onLog = async (stream: "stdout" | "stderr", chunk: string) => {
        const sanitizedChunk = redactCurrentUserText(chunk);
        if (stream === "stdout") stdoutExcerpt = appendExcerpt(stdoutExcerpt, sanitizedChunk);
        if (stream === "stderr") stderrExcerpt = appendExcerpt(stderrExcerpt, sanitizedChunk);
        const ts = new Date().toISOString();

        if (handle) {
          await runLogStore.append(handle, {
            stream,
            chunk: sanitizedChunk,
            ts,
          });
        }

        const payloadChunk =
          sanitizedChunk.length > MAX_LIVE_LOG_CHUNK_BYTES
            ? sanitizedChunk.slice(sanitizedChunk.length - MAX_LIVE_LOG_CHUNK_BYTES)
            : sanitizedChunk;

        publishLiveEvent({
          companyId: run.companyId,
          type: "heartbeat.run.log",
          payload: {
            runId: run.id,
            agentId: run.agentId,
            ts,
            stream,
            chunk: payloadChunk,
            truncated: payloadChunk.length !== sanitizedChunk.length,
          },
        });
      };
      for (const warning of runtimeWorkspaceWarnings) {
        await onLog("stderr", `[paperclip] ${warning}\n`);
      }
      const adapterEnv = Object.fromEntries(
        Object.entries(parseObject(resolvedConfig.env)).filter(
          (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
        ),
      );
      const runtimeServices = isChatLightMode
        ? []
        : await ensureRuntimeServicesForRun({
            db,
            runId: run.id,
            agent: {
              id: agent.id,
              name: agent.name,
              companyId: agent.companyId,
            },
            issue: issueRef,
            workspace: executionWorkspace,
            config: resolvedConfig,
            adapterEnv,
            onLog,
          });
      if (runtimeServices.length > 0) {
        context.paperclipRuntimeServices = runtimeServices;
        context.paperclipRuntimePrimaryUrl =
          runtimeServices.find((service) => readNonEmptyString(service.url))?.url ?? null;
        await db
          .update(heartbeatRuns)
          .set({
            contextSnapshot: context,
            updatedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));
      }
      if (issueId && (executionWorkspace.created || runtimeServices.some((service) => !service.reused))) {
        try {
          await issuesSvc.addComment(
            issueId,
            buildWorkspaceReadyComment({
              workspace: executionWorkspace,
              runtimeServices,
            }),
            { agentId: agent.id },
          );
        } catch (err) {
          await onLog(
            "stderr",
            `[paperclip] Failed to post workspace-ready comment: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }
      const onAdapterMeta = async (meta: AdapterInvocationMeta) => {
        if (meta.env && secretKeys.size > 0) {
          for (const key of secretKeys) {
            if (key in meta.env) meta.env[key] = "***REDACTED***";
          }
        }
        await appendRunEvent(currentRun, seq++, {
          eventType: "adapter.invoke",
          stream: "system",
          level: "info",
          message: "adapter invocation",
          payload: meta as unknown as Record<string, unknown>,
        });
      };

      if (isChatLightMode) {
        const memoriesSvc = agentMemoriesService(db);
        const crossChatSummary = await memoriesSvc.getRecentSummary(agent.companyId, agent.id).catch(() => null);
        if (crossChatSummary != null && crossChatSummary.trim() !== "") {
          context.crossChatMemorySummary = crossChatSummary;
        }
        const roomId = readNonEmptyString(context.roomId);
        if (roomId) {
          const roomSummary = await memoriesSvc.getRoomEarlierSummary(agent.companyId, agent.id, roomId).catch(() => null);
          if (roomSummary != null && roomSummary.trim() !== "") {
            context.roomEarlierSummary = roomSummary;
          }
        }
      }

      const adapter = getServerAdapter(agent.adapterType);
      const authToken = adapter.supportsLocalAgentJwt
        ? createLocalAgentJwt(agent.id, agent.companyId, agent.adapterType, run.id)
        : null;
      if (adapter.supportsLocalAgentJwt && !authToken) {
        logger.warn(
          {
            companyId: agent.companyId,
            agentId: agent.id,
            runId: run.id,
            adapterType: agent.adapterType,
          },
          "local agent jwt secret missing or invalid; running without injected PAPERCLIP_API_KEY",
        );
      }
      const MAX_WORKFLOW_CHAIN_STEPS_PER_HEARTBEAT = 20;
      let adapterResult: AdapterExecutionResult | null = null;
      let lastWorkflowPendingKey: string | null = null;

      const accumulatedUsage: Record<string, number> = {};
      let accumulatedCostUsd = 0;

      for (let chainIndex = 0; chainIndex < MAX_WORKFLOW_CHAIN_STEPS_PER_HEARTBEAT; chainIndex += 1) {
        await attachWorkflowPendingWorkerContext(db, agent.id, context);
        const wfPending = context.paperclipWorkflowPendingWorker as PaperclipWorkflowPendingWorkerContext | undefined;
        const wfKey = wfPending
          ? `${wfPending.runId}:${wfPending.pendingWorker.stepId}:${wfPending.pendingWorker.createdAt}`
          : null;

        if (chainIndex > 0 && !wfPending) break;
        if (wfKey && wfKey === lastWorkflowPendingKey) break;
        lastWorkflowPendingKey = wfKey;
        const keyBeforeExecute = wfKey;

        resolvedConfig.promptTemplate = wfPending
          ? `${basePromptTemplate}${buildWorkflowWorkerContinuationPromptBlock(wfPending)}`
          : basePromptTemplate;

        adapterResult = await adapter.execute({
          runId: run.id,
          agent,
          runtime: runtimeForAdapter,
          config: resolvedConfig,
          context,
          onLog,
          onMeta: onAdapterMeta,
          authToken: authToken ?? undefined,
        });

        // Accumulate usage and cost
        if (adapterResult.usage) {
          const u = adapterResult.usage as unknown as Record<string, unknown>;
          for (const [key, val] of Object.entries(u)) {
            if (typeof val === "number") {
              // Normalize keys to camelCase to ensure UI usageNumber picks them up consistently
              const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
              accumulatedUsage[camelKey] = (accumulatedUsage[camelKey] ?? 0) + val;
            }
          }
          // Ensure standard keys exist even if reported as snake_case or prompt_tokens by some adapters
          if (!u.inputTokens) {
            const inputVal = (u.input_tokens ?? u.prompt_tokens ?? u.promptTokens) as number | undefined;
            if (typeof inputVal === "number") {
              accumulatedUsage.inputTokens = (accumulatedUsage.inputTokens ?? 0) + inputVal;
            }
          }
          if (!u.outputTokens) {
            const outputVal = (u.output_tokens ?? u.completion_tokens ?? u.completionTokens) as number | undefined;
            if (typeof outputVal === "number") {
              accumulatedUsage.outputTokens = (accumulatedUsage.outputTokens ?? 0) + outputVal;
            }
          }
        }
        if (adapterResult.costUsd != null) {
          accumulatedCostUsd += adapterResult.costUsd;
        }

        const currentUsageJson = {
          ...accumulatedUsage,
          ...(accumulatedCostUsd > 0 ? { costUsd: accumulatedCostUsd } : {}),
          ...(adapterResult.billingType ? { billingType: adapterResult.billingType } : {}),
        };

        // Update run status with current accumulated usage for live UI feedback
        await db
          .update(heartbeatRuns)
          .set({
            usageJson: currentUsageJson,
            updatedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));

        // Update agent-level runtime state and record cost event for this specific step
        await updateRuntimeState(agent, run, adapterResult, {
          legacySessionId: runtimeForAdapter.sessionId,
        });

        const chainedSessionState = resolveNextSessionState({
          codec: sessionCodec,
          adapterResult,
          previousParams: runtimeForAdapter.sessionParams,
          previousDisplayId: runtimeForAdapter.sessionDisplayId,
          previousLegacySessionId: runtimeForAdapter.sessionId,
        });
        runtimeForAdapter = {
          ...runtimeForAdapter,
          sessionParams: chainedSessionState.params,
          sessionDisplayId: chainedSessionState.displayId,
          sessionId: chainedSessionState.legacySessionId,
        };

        // 若本次執行已失敗/超時/清 session，停止嘗試鏈式推進，交由外層照既有邏輯結算 outcome。
        if (
          adapterResult.timedOut ||
          (adapterResult.exitCode ?? 0) !== 0 ||
          adapterResult.errorMessage ||
          adapterResult.clearSession
        ) {
          break;
        }
        // worker-step-result 可能稍晚於 adapter 回傳；短暫輪詢 DB 再進入下一輪，避免誤判同一步而提前結束鏈。
        await pollUntilWorkflowWorkerStepAdvances(db, agent.id, keyBeforeExecute);
      }

      if (!adapterResult) {
        // 理論上 chainIndex=0 一定會執行一次；此保險避免 TypeScript 窄化問題
        adapterResult = await adapter.execute({
          runId: run.id,
          agent,
          runtime: runtimeForAdapter,
          config: resolvedConfig,
          context,
          onLog,
          onMeta: onAdapterMeta,
          authToken: authToken ?? undefined,
        });

        // Accumulate and update state for fallback execution
        if (adapterResult.usage) {
          const u = adapterResult.usage as unknown as Record<string, unknown>;
          for (const [key, val] of Object.entries(u)) {
            if (typeof val === "number") {
              const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
              accumulatedUsage[camelKey] = (accumulatedUsage[camelKey] ?? 0) + val;
            }
          }
        }
        if (adapterResult.costUsd != null) {
          accumulatedCostUsd += adapterResult.costUsd;
        }
        await updateRuntimeState(agent, run, adapterResult, {
          legacySessionId: runtimeForAdapter.sessionId,
        });
      }
      const adapterManagedRuntimeServices = adapterResult.runtimeServices
        ? await persistAdapterManagedRuntimeServices({
            db,
            adapterType: agent.adapterType,
            runId: run.id,
            agent: {
              id: agent.id,
              name: agent.name,
              companyId: agent.companyId,
            },
            issue: issueRef,
            workspace: executionWorkspace,
            reports: adapterResult.runtimeServices,
          })
        : [];
      if (adapterManagedRuntimeServices.length > 0) {
        const combinedRuntimeServices = [
          ...runtimeServices,
          ...adapterManagedRuntimeServices,
        ];
        context.paperclipRuntimeServices = combinedRuntimeServices;
        context.paperclipRuntimePrimaryUrl =
          combinedRuntimeServices.find((service) => readNonEmptyString(service.url))?.url ?? null;
        await db
          .update(heartbeatRuns)
          .set({
            contextSnapshot: context,
            updatedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));
        if (issueId) {
          try {
            await issuesSvc.addComment(
              issueId,
              buildWorkspaceReadyComment({
                workspace: executionWorkspace,
                runtimeServices: adapterManagedRuntimeServices,
              }),
              { agentId: agent.id },
            );
          } catch (err) {
            await onLog(
              "stderr",
              `[paperclip] Failed to post adapter-managed runtime comment: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        }
      }
      const nextSessionState = resolveNextSessionState({
        codec: sessionCodec,
        adapterResult,
        previousParams: previousSessionParams,
        previousDisplayId: runtimeForAdapter.sessionDisplayId,
        previousLegacySessionId: runtimeForAdapter.sessionId,
      });

      let outcome: "succeeded" | "failed" | "cancelled" | "timed_out";
      const latestRun = await getRun(run.id);
      if (latestRun?.status === "cancelled") {
        outcome = "cancelled";
      } else if (adapterResult.timedOut) {
        outcome = "timed_out";
      } else if ((adapterResult.exitCode ?? 0) === 0 && !adapterResult.errorMessage) {
        outcome = "succeeded";
      } else {
        outcome = "failed";
      }

      let logSummary: { bytes: number; sha256?: string; compressed: boolean } | null = null;
      if (handle) {
        logSummary = await runLogStore.finalize(handle);
      }

      const status =
        outcome === "succeeded"
          ? "succeeded"
          : outcome === "cancelled"
            ? "cancelled"
            : outcome === "timed_out"
              ? "timed_out"
              : "failed";

      const usageJson = {
        ...accumulatedUsage,
        ...(accumulatedCostUsd > 0 ? { costUsd: accumulatedCostUsd } : {}),
        ...(adapterResult.billingType ? { billingType: adapterResult.billingType } : {}),
      };

      await setRunStatus(run.id, status, {
        finishedAt: new Date(),
        error:
          outcome === "succeeded"
            ? null
            : redactCurrentUserText(
                adapterResult.errorMessage ?? (outcome === "timed_out" ? "Timed out" : "Adapter failed"),
              ),
        errorCode:
          outcome === "timed_out"
            ? "timeout"
            : outcome === "cancelled"
              ? "cancelled"
              : outcome === "failed"
                ? (adapterResult.errorCode ?? "adapter_failed")
                : null,
        exitCode: adapterResult.exitCode,
        signal: adapterResult.signal,
        usageJson,
        resultJson: adapterResult.resultJson ?? null,
        sessionIdAfter: nextSessionState.displayId ?? nextSessionState.legacySessionId,
        stdoutExcerpt,
        stderrExcerpt,
        logBytes: logSummary?.bytes,
        logSha256: logSummary?.sha256,
        logCompressed: logSummary?.compressed ?? false,
      });

      await setWakeupStatus(run.wakeupRequestId, outcome === "succeeded" ? "completed" : status, {
        finishedAt: new Date(),
        error: adapterResult.errorMessage ?? null,
      });

      const finalizedRun = await getRun(run.id);
      if (finalizedRun) {
        await appendRunEvent(finalizedRun, seq++, {
          eventType: "lifecycle",
          stream: "system",
          level: outcome === "succeeded" ? "info" : "error",
          message: `run ${outcome}`,
          payload: {
            status,
            exitCode: adapterResult.exitCode,
          },
        });
        await releaseIssueExecutionAndPromote(finalizedRun);

        if (taskKey) {
          if (
            adapterResult.clearSession ||
            (!nextSessionState.params && !nextSessionState.displayId)
          ) {
            await clearTaskSessions(agent.companyId, agent.id, {
              taskKey,
              adapterType: agent.adapterType,
            });
          } else {
            await upsertTaskSession({
              companyId: agent.companyId,
              agentId: agent.id,
              adapterType: agent.adapterType,
              taskKey,
              sessionParamsJson: nextSessionState.params,
              sessionDisplayId: nextSessionState.displayId,
              lastRunId: finalizedRun.id,
              lastError: outcome === "succeeded" ? null : (adapterResult.errorMessage ?? "run_failed"),
            });
          }
        }
      }
      await finalizeAgentStatus(agent.id, outcome);
    } catch (err) {
      const message = redactCurrentUserText(err instanceof Error ? err.message : "Unknown adapter failure");
      logger.error({ err, runId }, "heartbeat execution failed");

      let logSummary: { bytes: number; sha256?: string; compressed: boolean } | null = null;
      if (handle) {
        try {
          logSummary = await runLogStore.finalize(handle);
        } catch (finalizeErr) {
          logger.warn({ err: finalizeErr, runId }, "failed to finalize run log after error");
        }
      }

      const failedRun = await setRunStatus(run.id, "failed", {
        error: message,
        errorCode: "adapter_failed",
        finishedAt: new Date(),
        stdoutExcerpt,
        stderrExcerpt,
        logBytes: logSummary?.bytes,
        logSha256: logSummary?.sha256,
        logCompressed: logSummary?.compressed ?? false,
      });
      await setWakeupStatus(run.wakeupRequestId, "failed", {
        finishedAt: new Date(),
        error: message,
      });

      if (failedRun) {
        try {
          await appendRunEvent(failedRun, seq++, {
            eventType: "error",
            stream: "system",
            level: "error",
            message,
          });
          await releaseIssueExecutionAndPromote(failedRun);

          const failedResult: AdapterExecutionResult = {
            exitCode: null,
            signal: null,
            timedOut: false,
            errorMessage: message,
            usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
            costUsd: 0,
            provider: "unknown",
            model: "unknown",
          };
          // 使用 runtime（外層 scope），勿用 runtimeForAdapter（僅在 try 內定義，catch 中會 ReferenceError）
          await updateRuntimeState(agent, failedRun, failedResult, {
            legacySessionId: runtime?.sessionId ?? null,
          });

          if (taskKey && (previousSessionParams || previousSessionDisplayId || taskSession)) {
            await upsertTaskSession({
              companyId: agent.companyId,
              agentId: agent.id,
              adapterType: agent.adapterType,
              taskKey,
              sessionParamsJson: previousSessionParams,
              sessionDisplayId: previousSessionDisplayId,
              lastRunId: failedRun.id,
              lastError: message,
            });
          }
        } catch (catchErr) {
          logger.error(
            { err: catchErr, runId: failedRun.id, agentId: agent.id },
            "heartbeat error-handling path failed; run already marked failed",
          );
        }
      }

      try {
        await finalizeAgentStatus(agent.id, "failed");
      } catch (finalizeErr) {
        logger.error({ err: finalizeErr, agentId: agent.id }, "finalizeAgentStatus failed in error path");
      }
    } finally {
      await releaseRuntimeServicesForRun(run.id);
      await startNextQueuedRunForAgent(agent.id);
    }
  }

  async function releaseIssueExecutionAndPromote(run: typeof heartbeatRuns.$inferSelect) {
    const promotedRun = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from issues where company_id = ${run.companyId} and execution_run_id = ${run.id} for update`,
      );

      const issue = await tx
        .select({
          id: issues.id,
          companyId: issues.companyId,
        })
        .from(issues)
        .where(and(eq(issues.companyId, run.companyId), eq(issues.executionRunId, run.id)))
        .then((rows) => rows[0] ?? null);

      if (!issue) return;

      await tx
        .update(issues)
        .set({
          executionRunId: null,
          executionAgentNameKey: null,
          executionLockedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, issue.id));

      while (true) {
        const deferred = await tx
          .select()
          .from(agentWakeupRequests)
          .where(
            and(
              eq(agentWakeupRequests.companyId, issue.companyId),
              eq(agentWakeupRequests.status, "deferred_issue_execution"),
              sql`${agentWakeupRequests.payload} ->> 'issueId' = ${issue.id}`,
            ),
          )
          .orderBy(asc(agentWakeupRequests.requestedAt))
          .limit(1)
          .then((rows) => rows[0] ?? null);

        if (!deferred) return null;

        const deferredAgent = await tx
          .select()
          .from(agents)
          .where(eq(agents.id, deferred.agentId))
          .then((rows) => rows[0] ?? null);

        if (
          !deferredAgent ||
          deferredAgent.companyId !== issue.companyId ||
          deferredAgent.status === "paused" ||
          deferredAgent.status === "terminated" ||
          deferredAgent.status === "pending_approval"
        ) {
          await tx
            .update(agentWakeupRequests)
            .set({
              status: "failed",
              finishedAt: new Date(),
              error: "Deferred wake could not be promoted: agent is not invokable",
              updatedAt: new Date(),
            })
            .where(eq(agentWakeupRequests.id, deferred.id));
          continue;
        }

        const deferredPayload = parseObject(deferred.payload);
        const deferredContextSeed = parseObject(deferredPayload[DEFERRED_WAKE_CONTEXT_KEY]);
        const promotedContextSeed: Record<string, unknown> = { ...deferredContextSeed };
        const promotedReason = readNonEmptyString(deferred.reason) ?? "issue_execution_promoted";
        const promotedSource =
          (readNonEmptyString(deferred.source) as WakeupOptions["source"]) ?? "automation";
        const promotedTriggerDetail =
          (readNonEmptyString(deferred.triggerDetail) as WakeupOptions["triggerDetail"]) ?? null;
        const promotedPayload = deferredPayload;
        delete promotedPayload[DEFERRED_WAKE_CONTEXT_KEY];

        const {
          contextSnapshot: promotedContextSnapshot,
          taskKey: promotedTaskKey,
        } = enrichWakeContextSnapshot({
          contextSnapshot: promotedContextSeed,
          reason: promotedReason,
          source: promotedSource,
          triggerDetail: promotedTriggerDetail,
          payload: promotedPayload,
        });

        const sessionBefore = await resolveSessionBeforeForWakeup(deferredAgent, promotedTaskKey);
        const now = new Date();
        const newRun = await tx
          .insert(heartbeatRuns)
          .values({
            companyId: deferredAgent.companyId,
            agentId: deferredAgent.id,
            invocationSource: promotedSource,
            triggerDetail: promotedTriggerDetail,
            status: "queued",
            wakeupRequestId: deferred.id,
            contextSnapshot: promotedContextSnapshot,
            sessionIdBefore: sessionBefore,
          })
          .returning()
          .then((rows) => rows[0]);

        await tx
          .update(agentWakeupRequests)
          .set({
            status: "queued",
            reason: "issue_execution_promoted",
            runId: newRun.id,
            claimedAt: null,
            finishedAt: null,
            error: null,
            updatedAt: now,
          })
          .where(eq(agentWakeupRequests.id, deferred.id));

        await tx
          .update(issues)
          .set({
            executionRunId: newRun.id,
            executionAgentNameKey: normalizeAgentNameKey(deferredAgent.name),
            executionLockedAt: now,
            updatedAt: now,
          })
          .where(eq(issues.id, issue.id));

        return newRun;
      }
    });

    if (!promotedRun) {
      await wakeIssueSiblingsIfReady(run);
      return;
    }

    publishLiveEvent({
      companyId: promotedRun.companyId,
      type: "heartbeat.run.queued",
      payload: {
        runId: promotedRun.id,
        agentId: promotedRun.agentId,
        invocationSource: promotedRun.invocationSource,
        triggerDetail: promotedRun.triggerDetail,
        wakeupRequestId: promotedRun.wakeupRequestId,
      },
    });

    await startNextQueuedRunForAgent(promotedRun.agentId);
    await wakeIssueSiblingsIfReady(run);
  }

  /**
   * Issue: 當 run 完成後，若該 run 對應的 issue 有同 parent、同 assignee 的 siblings 處於 deferred_Issue_dependencies，
   * 且依賴已滿足，則對該 agent 發送 wake（會重新進入 enqueueWakeup，通過依賴檢查後建立 run）。
   */
  async function wakeIssueSiblingsIfReady(run: typeof heartbeatRuns.$inferSelect) {
    const context = parseObject(run.contextSnapshot);
    const issueId = readNonEmptyString(context?.issueId);
    if (!issueId) return;

    const issue = await db
      .select({
        id: issues.id,
        parentId: issues.parentId,
        assigneeAgentId: issues.assigneeAgentId,
        companyId: issues.companyId,
      })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.companyId, run.companyId)))
      .then((rows) => rows[0] ?? null);
    if (!issue?.parentId || !issue.assigneeAgentId) return;

    const parent = await db
      .select({ executionPolicy: issues.executionPolicy })
      .from(issues)
      .where(and(eq(issues.id, issue.parentId), eq(issues.companyId, issue.companyId)))
      .then((rows) => rows[0] ?? null);
    const policy = parent?.executionPolicy as
      | { subtaskExecutionPolicy?: string; subtaskExecutionOrder?: string[]; subtaskPhases?: string[][] }
      | null
      | undefined;
    if (
      policy?.subtaskExecutionPolicy !== "sequential" &&
      policy?.subtaskExecutionPolicy !== "phased"
    ) {
      return;
    }

    const siblings = await db
      .select({
        id: issues.id,
        status: issues.status,
        createdAt: issues.createdAt,
        issueNumber: issues.issueNumber,
      })
      .from(issues)
      .where(
        and(
          eq(issues.parentId, issue.parentId),
          eq(issues.assigneeAgentId, issue.assigneeAgentId),
        ),
      );
    const deferredForSiblings = await db
      .select({
        id: agentWakeupRequests.id,
        payload: agentWakeupRequests.payload,
      })
      .from(agentWakeupRequests)
      .where(
        and(
          eq(agentWakeupRequests.companyId, run.companyId),
          eq(agentWakeupRequests.agentId, run.agentId),
          eq(agentWakeupRequests.status, "deferred_Issue_dependencies"),
        ),
      );
    const siblingIdsWithDeferred = new Set(
      deferredForSiblings
        .map((r) => readNonEmptyString(parseObject(r.payload)?.issueId))
        .filter((id): id is string => !!id),
    );
    for (const siblingId of siblingIdsWithDeferred) {
      if (siblingId === issueId) continue;
      if (!canRunIssueWithIssuePolicy(siblingId, policy, siblings)) continue;
      try {
        await enqueueWakeup(run.agentId, {
          source: "automation",
          triggerDetail: "system",
          reason: "Issue_predecessor_completed",
          payload: { issueId: siblingId },
          contextSnapshot: { issueId: siblingId },
        });
      } catch (err) {
        logger.warn(
          { err, completedRunId: run.id, siblingIssueId: siblingId, agentId: run.agentId },
          "Issue: failed to wake sibling after predecessor completed",
        );
      }
    }
  }

  async function enqueueWakeup(agentId: string, opts: WakeupOptions = {}) {
    const source = opts.source ?? "on_demand";
    const triggerDetail = opts.triggerDetail ?? null;
    const contextSnapshot: Record<string, unknown> = { ...(opts.contextSnapshot ?? {}) };
    const reason = opts.reason ?? null;
    const payload = opts.payload ?? null;
    const {
      contextSnapshot: enrichedContextSnapshot,
      issueIdFromPayload,
      taskKey,
      wakeCommentId,
    } = enrichWakeContextSnapshot({
      contextSnapshot,
      reason,
      source,
      triggerDetail,
      payload,
    });
    const issueId = readNonEmptyString(enrichedContextSnapshot.issueId) ?? issueIdFromPayload;

    const agent = await getAgent(agentId);
    if (!agent) throw notFound("Agent not found");

    if (
      agent.status === "paused" ||
      agent.status === "terminated" ||
      agent.status === "pending_approval"
    ) {
      throw conflict("Agent is not invokable in its current state", { status: agent.status });
    }

    const idempotencyKey = readNonEmptyString(opts.idempotencyKey);
    if (idempotencyKey) {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      const [existingWake] = await db
        .select({ runId: agentWakeupRequests.runId })
        .from(agentWakeupRequests)
        .where(
          and(
            eq(agentWakeupRequests.agentId, agentId),
            eq(agentWakeupRequests.idempotencyKey, idempotencyKey),
            gt(agentWakeupRequests.requestedAt, cutoff),
          ),
        )
        .orderBy(desc(agentWakeupRequests.requestedAt))
        .limit(1);
      if (existingWake?.runId) {
        const existingRun = await getRun(existingWake.runId);
        if (existingRun) return existingRun;
      }
    }

    const policyNow = new Date();
    const maintenanceRow = await db
      .select({
        wakeupsPausedUntil: companies.wakeupsPausedUntil,
        maintenanceWindows: companies.maintenanceWindows,
      })
      .from(companies)
      .where(eq(companies.id, agent.companyId))
      .then((rows) => rows[0] ?? null);
    const inMaintenance =
      maintenanceRow != null &&
      (isWakeupsPausedUntilActive(maintenanceRow.wakeupsPausedUntil, policyNow) ||
        isWithinMaintenanceWindows(policyNow, maintenanceRow.maintenanceWindows ?? undefined));
    if (inMaintenance) {
      await db.insert(agentWakeupRequests).values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason: "company.maintenance_window",
        payload,
        status: "skipped",
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        finishedAt: new Date(),
      });
      const silentMaintenance = source === "timer" || source === "automation";
      if (silentMaintenance) {
        return null;
      }
      throw conflict("Company is in maintenance; new wakeups are blocked", {
        code: "maintenance_window_active",
      });
    }

    const limitExceeded = await costService(db).isCompanyLimitExceeded(agent.companyId);
    if (limitExceeded.reason) {
      const skipReason = `company.${limitExceeded.reason}_reached`;
      await db.insert(agentWakeupRequests).values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason: skipReason,
        payload,
        status: "skipped",
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        finishedAt: new Date(),
      });
      if (source === "timer") {
        return null;
      }
      const code =
        limitExceeded.reason === "token_limit"
          ? "token_limit_reached"
          : "price_limit_reached";
      throw conflict("Company limit reached; new runs are blocked", { code });
    }

    const budgetPolicies = budgetPolicyService(db);
    const skipBudgetPolicy = async (skipReason: string): Promise<null> => {
      await db.insert(agentWakeupRequests).values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason: skipReason,
        payload,
        status: "skipped",
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        finishedAt: new Date(),
      });
      if (source === "timer") {
        return null;
      }
      throw conflict("Budget policy scope blocks new runs", {
        code: "budget_policy_scope_reached",
      });
    };

    if (await budgetPolicies.isCompanyScopeBlocking(agent.companyId, policyNow)) {
      return await skipBudgetPolicy("company.budget_policy_company_scope_reached");
    }

    let projectIdForBudget: string | null = null;
    if (issueId) {
      const issueRow = await db
        .select({ projectId: issues.projectId })
        .from(issues)
        .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
        .then((rows) => rows[0] ?? null);
      projectIdForBudget = issueRow?.projectId ?? null;
    }
    const ctxProjectId = readNonEmptyString(enrichedContextSnapshot.projectId);
    if (ctxProjectId) {
      projectIdForBudget = ctxProjectId;
    }
    if (
      projectIdForBudget &&
      (await budgetPolicies.isProjectScopeBlocking(agent.companyId, projectIdForBudget, policyNow))
    ) {
      return await skipBudgetPolicy("company.budget_policy_project_scope_reached");
    }

    const billingFromCtx = readNonEmptyString(enrichedContextSnapshot.billingCode);
    if (
      billingFromCtx &&
      (await budgetPolicies.isBillingCodeScopeBlocking(agent.companyId, billingFromCtx, policyNow))
    ) {
      return await skipBudgetPolicy("company.budget_policy_billing_scope_reached");
    }

    const policy = parseHeartbeatPolicy(agent);
    const writeSkippedRequest = async (reason: string) => {
      await db.insert(agentWakeupRequests).values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason,
        payload,
        status: "skipped",
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        finishedAt: new Date(),
      });
    };

    if (source === "timer" && !policy.enabled) {
      await writeSkippedRequest("heartbeat.disabled");
      return null;
    }
    if (source !== "timer" && !policy.wakeOnDemand) {
      await writeSkippedRequest("heartbeat.wakeOnDemand.disabled");
      return null;
    }

    const bypassIssueExecutionLock =
      reason === "issue_comment_mentioned" ||
      readNonEmptyString(enrichedContextSnapshot.wakeReason) === "issue_comment_mentioned" ||
      reason === "chat_message_mentioned" ||
      readNonEmptyString(enrichedContextSnapshot.wakeReason) === "chat_message_mentioned";

    if (issueId && !bypassIssueExecutionLock) {
      const agentNameKey = normalizeAgentNameKey(agent.name);
      const sessionBefore = await resolveSessionBeforeForWakeup(agent, taskKey);

      const outcome = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select id from issues where id = ${issueId} and company_id = ${agent.companyId} for update`,
        );

        const issue = await tx
          .select({
            id: issues.id,
            companyId: issues.companyId,
            parentId: issues.parentId,
            assigneeAgentId: issues.assigneeAgentId,
            status: issues.status,
            executionRunId: issues.executionRunId,
            executionAgentNameKey: issues.executionAgentNameKey,
            executionLabel: issues.executionLabel,
          })
          .from(issues)
          .where(and(eq(issues.id, issueId), eq(issues.companyId, agent.companyId)))
          .then((rows) => rows[0] ?? null);

        if (!issue) {
          await tx.insert(agentWakeupRequests).values({
            companyId: agent.companyId,
            agentId,
            source,
            triggerDetail,
            reason: "issue_execution_issue_not_found",
            payload,
            status: "skipped",
            requestedByActorType: opts.requestedByActorType ?? null,
            requestedByActorId: opts.requestedByActorId ?? null,
            idempotencyKey: opts.idempotencyKey ?? null,
            finishedAt: new Date(),
          });
          return { kind: "skipped" as const };
        }

        let activeExecutionRun = issue.executionRunId
          ? await tx
            .select()
            .from(heartbeatRuns)
            .where(eq(heartbeatRuns.id, issue.executionRunId))
            .then((rows) => rows[0] ?? null)
          : null;

        if (activeExecutionRun && activeExecutionRun.status !== "queued" && activeExecutionRun.status !== "running") {
          activeExecutionRun = null;
        }

        if (!activeExecutionRun && issue.executionRunId) {
          await tx
            .update(issues)
            .set({
              executionRunId: null,
              executionAgentNameKey: null,
              executionLockedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(issues.id, issue.id));
        }

        if (!activeExecutionRun) {
          const legacyRun = await tx
            .select()
            .from(heartbeatRuns)
            .where(
              and(
                eq(heartbeatRuns.companyId, issue.companyId),
                inArray(heartbeatRuns.status, ["queued", "running"]),
                sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
              ),
            )
            .orderBy(
              sql`case when ${heartbeatRuns.status} = 'running' then 0 else 1 end`,
              asc(heartbeatRuns.createdAt),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null);

          if (legacyRun) {
            activeExecutionRun = legacyRun;
            const legacyAgent = await tx
              .select({ name: agents.name })
              .from(agents)
              .where(eq(agents.id, legacyRun.agentId))
              .then((rows) => rows[0] ?? null);
            await tx
              .update(issues)
              .set({
                executionRunId: legacyRun.id,
                executionAgentNameKey: normalizeAgentNameKey(legacyAgent?.name),
                executionLockedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(issues.id, issue.id));
          }
        }

        if (activeExecutionRun) {
          const executionAgent = await tx
            .select({ name: agents.name })
            .from(agents)
            .where(eq(agents.id, activeExecutionRun.agentId))
            .then((rows) => rows[0] ?? null);
          const executionAgentNameKey =
            normalizeAgentNameKey(issue.executionAgentNameKey) ??
            normalizeAgentNameKey(executionAgent?.name);
          const isSameExecutionAgent =
            Boolean(executionAgentNameKey) && executionAgentNameKey === agentNameKey;
          const shouldQueueFollowupForCommentWake =
            Boolean(wakeCommentId) &&
            activeExecutionRun.status === "running" &&
            isSameExecutionAgent;

          if (isSameExecutionAgent && !shouldQueueFollowupForCommentWake) {
            const mergedContextSnapshot = mergeCoalescedContextSnapshot(
              activeExecutionRun.contextSnapshot,
              enrichedContextSnapshot,
            );
            const mergedRun = await tx
              .update(heartbeatRuns)
              .set({
                contextSnapshot: mergedContextSnapshot,
                updatedAt: new Date(),
              })
              .where(eq(heartbeatRuns.id, activeExecutionRun.id))
              .returning()
              .then((rows) => rows[0] ?? activeExecutionRun);

            await tx.insert(agentWakeupRequests).values({
              companyId: agent.companyId,
              agentId,
              source,
              triggerDetail,
              reason: "issue_execution_same_name",
              payload,
              status: "coalesced",
              coalescedCount: 1,
              requestedByActorType: opts.requestedByActorType ?? null,
              requestedByActorId: opts.requestedByActorId ?? null,
              idempotencyKey: opts.idempotencyKey ?? null,
              runId: mergedRun.id,
              finishedAt: new Date(),
            });

            return { kind: "coalesced" as const, run: mergedRun };
          }

          const deferredPayload = {
            ...(payload ?? {}),
            issueId,
            [DEFERRED_WAKE_CONTEXT_KEY]: enrichedContextSnapshot,
          };

          const existingDeferred = await tx
            .select()
            .from(agentWakeupRequests)
            .where(
              and(
                eq(agentWakeupRequests.companyId, agent.companyId),
                eq(agentWakeupRequests.agentId, agentId),
                eq(agentWakeupRequests.status, "deferred_issue_execution"),
                sql`${agentWakeupRequests.payload} ->> 'issueId' = ${issue.id}`,
              ),
            )
            .orderBy(asc(agentWakeupRequests.requestedAt))
            .limit(1)
            .then((rows) => rows[0] ?? null);

          if (existingDeferred) {
            const existingDeferredPayload = parseObject(existingDeferred.payload);
            const existingDeferredContext = parseObject(existingDeferredPayload[DEFERRED_WAKE_CONTEXT_KEY]);
            const mergedDeferredContext = mergeCoalescedContextSnapshot(
              existingDeferredContext,
              enrichedContextSnapshot,
            );
            const mergedDeferredPayload = {
              ...existingDeferredPayload,
              ...(payload ?? {}),
              issueId,
              [DEFERRED_WAKE_CONTEXT_KEY]: mergedDeferredContext,
            };

            await tx
              .update(agentWakeupRequests)
              .set({
                payload: mergedDeferredPayload,
                coalescedCount: (existingDeferred.coalescedCount ?? 0) + 1,
                updatedAt: new Date(),
              })
              .where(eq(agentWakeupRequests.id, existingDeferred.id));

            return { kind: "deferred" as const };
          }

          await tx.insert(agentWakeupRequests).values({
            companyId: agent.companyId,
            agentId,
            source,
            triggerDetail,
            reason: "issue_execution_deferred",
            payload: deferredPayload,
            status: "deferred_issue_execution",
            requestedByActorType: opts.requestedByActorType ?? null,
            requestedByActorId: opts.requestedByActorId ?? null,
            idempotencyKey: opts.idempotencyKey ?? null,
          });

          return { kind: "deferred" as const };
        }

        if (!activeExecutionRun && issue.parentId && issue.assigneeAgentId) {
          const parent = await tx
            .select({ executionPolicy: issues.executionPolicy })
            .from(issues)
            .where(and(eq(issues.id, issue.parentId), eq(issues.companyId, issue.companyId)))
            .then((rows) => rows[0] ?? null);
          const policy = parent?.executionPolicy as
            | { subtaskExecutionPolicy?: string; subtaskExecutionOrder?: string[]; subtaskPhases?: string[][] }
            | null
            | undefined;
          if (
            policy?.subtaskExecutionPolicy === "sequential" ||
            policy?.subtaskExecutionPolicy === "phased"
          ) {
            const siblings = await tx
              .select({
                id: issues.id,
                status: issues.status,
                createdAt: issues.createdAt,
                issueNumber: issues.issueNumber,
              })
              .from(issues)
              .where(
                and(
                  eq(issues.parentId, issue.parentId),
                  eq(issues.assigneeAgentId, issue.assigneeAgentId),
                ),
              );
            if (!canRunIssueWithIssuePolicy(issue.id, policy, siblings)) {
              const deferredPayload = {
                ...(payload ?? {}),
                issueId,
                [DEFERRED_WAKE_CONTEXT_KEY]: enrichedContextSnapshot,
              };
              await tx.insert(agentWakeupRequests).values({
                companyId: agent.companyId,
                agentId,
                source,
                triggerDetail,
                reason: "Issue_dependencies_not_met",
                payload: deferredPayload,
                status: "deferred_Issue_dependencies",
                requestedByActorType: opts.requestedByActorType ?? null,
                requestedByActorId: opts.requestedByActorId ?? null,
                idempotencyKey: opts.idempotencyKey ?? null,
              });
              return { kind: "deferred" as const };
            }
          }
        }

        const wakeupRequest = await tx
          .insert(agentWakeupRequests)
          .values({
            companyId: agent.companyId,
            agentId,
            source,
            triggerDetail,
            reason,
            payload,
            status: "queued",
            requestedByActorType: opts.requestedByActorType ?? null,
            requestedByActorId: opts.requestedByActorId ?? null,
            idempotencyKey: opts.idempotencyKey ?? null,
          })
          .returning()
          .then((rows) => rows[0]);

        const runContextSnapshot: Record<string, unknown> = { ...enrichedContextSnapshot };
        if (issue.executionLabel) runContextSnapshot.executionLabel = issue.executionLabel;

        const newRun = await tx
          .insert(heartbeatRuns)
          .values({
            companyId: agent.companyId,
            agentId,
            invocationSource: source,
            triggerDetail,
            status: "queued",
            wakeupRequestId: wakeupRequest.id,
            contextSnapshot: runContextSnapshot,
            sessionIdBefore: sessionBefore,
          })
          .returning()
          .then((rows) => rows[0]);

        await tx
          .update(agentWakeupRequests)
          .set({
            runId: newRun.id,
            updatedAt: new Date(),
          })
          .where(eq(agentWakeupRequests.id, wakeupRequest.id));

        await tx
          .update(issues)
          .set({
            executionRunId: newRun.id,
            executionAgentNameKey: agentNameKey,
            executionLockedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(issues.id, issue.id));

        return { kind: "queued" as const, run: newRun };
      });

      if (outcome.kind === "deferred" || outcome.kind === "skipped") return null;
      if (outcome.kind === "coalesced") return outcome.run;

      const newRun = outcome.run;
      publishLiveEvent({
        companyId: newRun.companyId,
        type: "heartbeat.run.queued",
        payload: {
          runId: newRun.id,
          agentId: newRun.agentId,
          invocationSource: newRun.invocationSource,
          triggerDetail: newRun.triggerDetail,
          wakeupRequestId: newRun.wakeupRequestId,
        },
      });

      await startNextQueuedRunForAgent(agent.id);
      return newRun;
    }

    const activeRuns = await db
      .select()
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.agentId, agentId), inArray(heartbeatRuns.status, ["queued", "running"])))
      .orderBy(desc(heartbeatRuns.createdAt));

    const sameScopeQueuedRun = activeRuns.find(
      (candidate) => candidate.status === "queued" && isSameTaskScope(runTaskKey(candidate), taskKey),
    );
    const sameScopeRunningRun = activeRuns.find(
      (candidate) => candidate.status === "running" && isSameTaskScope(runTaskKey(candidate), taskKey),
    );
    const shouldQueueFollowupForCommentWake =
      Boolean(wakeCommentId) && Boolean(sameScopeRunningRun) && !sameScopeQueuedRun;

    const coalescedTargetRun =
      sameScopeQueuedRun ??
      (shouldQueueFollowupForCommentWake ? null : sameScopeRunningRun ?? null);

    if (coalescedTargetRun) {
      const mergedContextSnapshot = mergeCoalescedContextSnapshot(
        coalescedTargetRun.contextSnapshot,
        contextSnapshot,
      );
      const mergedRun = await db
        .update(heartbeatRuns)
        .set({
          contextSnapshot: mergedContextSnapshot,
          updatedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, coalescedTargetRun.id))
        .returning()
        .then((rows) => rows[0] ?? coalescedTargetRun);

      await db.insert(agentWakeupRequests).values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason,
        payload,
        status: "coalesced",
        coalescedCount: 1,
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
        runId: mergedRun.id,
        finishedAt: new Date(),
      });
      return mergedRun;
    }

    const wakeupRequest = await db
      .insert(agentWakeupRequests)
      .values({
        companyId: agent.companyId,
        agentId,
        source,
        triggerDetail,
        reason,
        payload,
        status: "queued",
        requestedByActorType: opts.requestedByActorType ?? null,
        requestedByActorId: opts.requestedByActorId ?? null,
        idempotencyKey: opts.idempotencyKey ?? null,
      })
      .returning()
      .then((rows) => rows[0]);

    const sessionBefore = await resolveSessionBeforeForWakeup(agent, taskKey);

    const newRun = await db
      .insert(heartbeatRuns)
      .values({
        companyId: agent.companyId,
        agentId,
        invocationSource: source,
        triggerDetail,
        status: "queued",
        wakeupRequestId: wakeupRequest.id,
        contextSnapshot: enrichedContextSnapshot,
        sessionIdBefore: sessionBefore,
      })
      .returning()
      .then((rows) => rows[0]);

    await db
      .update(agentWakeupRequests)
      .set({
        runId: newRun.id,
        updatedAt: new Date(),
      })
      .where(eq(agentWakeupRequests.id, wakeupRequest.id));

    publishLiveEvent({
      companyId: newRun.companyId,
      type: "heartbeat.run.queued",
      payload: {
        runId: newRun.id,
        agentId: newRun.agentId,
        invocationSource: newRun.invocationSource,
        triggerDetail: newRun.triggerDetail,
        wakeupRequestId: newRun.wakeupRequestId,
      },
    });

    await startNextQueuedRunForAgent(agent.id);

    return newRun;
  }

  return {
    list: async (
      companyId: string,
      filters?: {
        agentId?: string;
        limit?: number;
        startedAfter?: Date;
        endedBefore?: Date;
        statuses?: string[];
        invocationSources?: string[];
        cursorCreatedAt?: Date;
        cursorId?: string;
      },
    ): Promise<HeartbeatRunsListResponse> => {
      const conditions = [eq(heartbeatRuns.companyId, companyId)];
      if (filters?.agentId) conditions.push(eq(heartbeatRuns.agentId, filters.agentId));
      if (filters?.startedAfter) conditions.push(gte(heartbeatRuns.createdAt, filters.startedAfter));
      if (filters?.endedBefore) conditions.push(lte(heartbeatRuns.createdAt, filters.endedBefore));
      if (filters?.statuses?.length) {
        conditions.push(inArray(heartbeatRuns.status, filters.statuses as [string, ...string[]]));
      }
      if (filters?.invocationSources?.length) {
        conditions.push(
          inArray(heartbeatRuns.invocationSource, filters.invocationSources as [string, ...string[]]),
        );
      }
      if (filters?.cursorCreatedAt && filters?.cursorId) {
        conditions.push(
          or(
            lt(heartbeatRuns.createdAt, filters.cursorCreatedAt),
            and(eq(heartbeatRuns.createdAt, filters.cursorCreatedAt), lt(heartbeatRuns.id, filters.cursorId)),
          )!,
        );
      }

      const lim = Math.min(1000, Math.max(1, filters?.limit ?? 200));
      const rows = await db
        .select(heartbeatRunListColumns)
        .from(heartbeatRuns)
        .where(and(...conditions))
        .orderBy(desc(heartbeatRuns.createdAt), desc(heartbeatRuns.id))
        .limit(lim + 1);

      const hasMore = rows.length > lim;
      const slice = hasMore ? rows.slice(0, lim) : rows;
      const mapped: HeartbeatRun[] = slice.map((row) => ({
        ...row,
        resultJson: summarizeHeartbeatRunResultJson(row.resultJson),
      })) as HeartbeatRun[];
      const last = slice[slice.length - 1];
      const nextCursor =
        hasMore && last ? encodeHeartbeatRunCursor(last.createdAt, last.id) : null;
      return { runs: mapped, nextCursor };
    },

    getRun,

    getRuntimeState: async (agentId: string) => {
      const state = await getRuntimeState(agentId);
      const agent = await getAgent(agentId);
      if (!agent) return null;
      const ensured = state ?? (await ensureRuntimeState(agent));
      const latestTaskSession = await db
        .select()
        .from(agentTaskSessions)
        .where(and(eq(agentTaskSessions.companyId, agent.companyId), eq(agentTaskSessions.agentId, agent.id)))
        .orderBy(desc(agentTaskSessions.updatedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      return {
        ...ensured,
        sessionDisplayId: latestTaskSession?.sessionDisplayId ?? ensured.sessionId,
        sessionParamsJson: latestTaskSession?.sessionParamsJson ?? null,
      };
    },

    listTaskSessions: async (agentId: string) => {
      const agent = await getAgent(agentId);
      if (!agent) throw notFound("Agent not found");

      return db
        .select()
        .from(agentTaskSessions)
        .where(and(eq(agentTaskSessions.companyId, agent.companyId), eq(agentTaskSessions.agentId, agentId)))
        .orderBy(desc(agentTaskSessions.updatedAt), desc(agentTaskSessions.createdAt));
    },

    resetRuntimeSession: async (agentId: string, opts?: { taskKey?: string | null }) => {
      const agent = await getAgent(agentId);
      if (!agent) throw notFound("Agent not found");
      await ensureRuntimeState(agent);
      const taskKey = readNonEmptyString(opts?.taskKey);
      const clearedTaskSessions = await clearTaskSessions(
        agent.companyId,
        agent.id,
        taskKey ? { taskKey, adapterType: agent.adapterType } : undefined,
      );
      const runtimePatch: Partial<typeof agentRuntimeState.$inferInsert> = {
        sessionId: null,
        lastError: null,
        updatedAt: new Date(),
      };
      if (!taskKey) {
        runtimePatch.stateJson = {};
      }

      const updated = await db
        .update(agentRuntimeState)
        .set(runtimePatch)
        .where(eq(agentRuntimeState.agentId, agentId))
        .returning()
        .then((rows) => rows[0] ?? null);

      if (!updated) return null;
      return {
        ...updated,
        sessionDisplayId: null,
        sessionParamsJson: null,
        clearedTaskSessions,
      };
    },

    listEvents: (runId: string, afterSeq = 0, limit = 200) =>
      db
        .select()
        .from(heartbeatRunEvents)
        .where(and(eq(heartbeatRunEvents.runId, runId), gt(heartbeatRunEvents.seq, afterSeq)))
        .orderBy(asc(heartbeatRunEvents.seq))
        .limit(Math.max(1, Math.min(limit, 1000))),

    readLog: async (runId: string, opts?: { offset?: number; limitBytes?: number }) => {
      const run = await getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      if (!run.logStore || !run.logRef) throw notFound("Run log not found");

      const result = await runLogStore.read(
        {
          store: run.logStore as "local_file",
          logRef: run.logRef,
        },
        opts,
      );

      return {
        runId,
        store: run.logStore,
        logRef: run.logRef,
        ...result,
        content: redactCurrentUserText(result.content),
      };
    },

    invoke: async (
      agentId: string,
      source: "timer" | "assignment" | "on_demand" | "automation" = "on_demand",
      contextSnapshot: Record<string, unknown> = {},
      triggerDetail: "manual" | "ping" | "callback" | "system" = "manual",
      actor?: { actorType?: "user" | "agent" | "system"; actorId?: string | null },
    ) =>
      enqueueWakeup(agentId, {
        source,
        triggerDetail,
        contextSnapshot,
        requestedByActorType: actor?.actorType,
        requestedByActorId: actor?.actorId ?? null,
      }),

    wakeup: enqueueWakeup,

    retryWakeFromRun: async (runId: string) => {
      const run = await getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      const ctx = {
        ...(run.contextSnapshot && typeof run.contextSnapshot === "object"
          ? (run.contextSnapshot as Record<string, unknown>)
          : {}),
        replayFromRunId: run.id,
      };
      return enqueueWakeup(run.agentId, {
        source: "on_demand",
        triggerDetail: "manual",
        reason: "replay_from_run",
        payload: { replayFromRunId: run.id },
        contextSnapshot: ctx,
        requestedByActorType: "user",
        requestedByActorId: null,
      });
    },

    reapOrphanedRuns,

    tickTimers: async (now = new Date()) => {
      const allAgents = await db.select().from(agents);
      let checked = 0;
      let enqueued = 0;
      let skipped = 0;
      let skippedNoWork = 0;

      /**
       * 取得下一個可被處理的未完成 Goal（planned/active 且已到刷新時間）。
       * - 定期目標：只有 `now >= recurrenceNextRefreshAt` 才計入
       * - 一次性目標：`recurrence=one_time` 直接計入
       */
      async function getNextUnfinishedGoal(companyId: string): Promise<
        | (typeof goals.$inferSelect & {
            description: string | null;
          })
        | null
      > {
        const [row] = await db
          .select()
          .from(goals)
          .where(
            and(
              eq(goals.companyId, companyId),
              inArray(goals.status, ["planned", "active"]),
              or(
                eq(goals.recurrence, "one_time"),
                isNull(goals.recurrenceNextRefreshAt),
                lte(goals.recurrenceNextRefreshAt, now),
              ),
            ),
          )
          .orderBy(
            // 多個 Goal 時需挑選穩定且可預期的「下一個目標」：
            // 1) active 優先
            // 2) 先處理已到期的定期目標（non-one_time），再處理 one_time
            // 3) 到期/建立時間早者優先
            sql`CASE WHEN ${goals.status} = 'active' THEN 0 ELSE 1 END`,
            sql`CASE WHEN ${goals.recurrence} = 'one_time' THEN 1 ELSE 0 END`,
            asc(goals.recurrenceNextRefreshAt),
            asc(goals.createdAt),
          )
          .limit(1);
        return row ?? null;
      }

      /** agent 是否已有任何未完成的 assigned issue（避免建立重複 issue）。 */
      async function agentHasUnfinishedAssignedIssue(companyId: string, agentId: string): Promise<boolean> {
        const [unfinishedIssue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.assigneeAgentId, agentId),
              // 必須與 OpenClaw Gateway step 4 的查詢條件一致
              // 否則會出現：
              // - 後端認為有工作（例如 backlog）
              // - adapter 卻視為「issues 清單為空」並自行建立新 issue
              inArray(issues.status, ["todo", "in_progress", "blocked"]),
            ),
          )
          .limit(1);
        return !!unfinishedIssue;
      }

      /** 若該 goal 已經為此 agent 建立過未完成 issue，則不要重複建立。 */
      async function agentHasUnfinishedIssueForGoal(
        companyId: string,
        agentId: string,
        goalId: string,
      ): Promise<boolean> {
        const [existingIssue] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(
            and(
              eq(issues.companyId, companyId),
              eq(issues.assigneeAgentId, agentId),
              eq(issues.goalId, goalId),
              not(inArray(issues.status, ["done", "cancelled"])),
            ),
          )
          .limit(1);
        return !!existingIssue;
      }

      for (const agent of allAgents) {
        if (agent.status === "paused" || agent.status === "terminated" || agent.status === "pending_approval") continue;
        const policy = parseHeartbeatPolicy(agent);
        if (!policy.enabled || policy.intervalSec <= 0) continue;

        checked += 1;
        const baseline = new Date(agent.lastHeartbeatAt ?? agent.createdAt).getTime();
        const elapsedMs = now.getTime() - baseline;
        if (elapsedMs < policy.intervalSec * 1000) continue;

        const hasAssignedWork = await agentHasUnfinishedAssignedIssue(agent.companyId, agent.id);
        const nextGoal = hasAssignedWork ? null : await getNextUnfinishedGoal(agent.companyId);

        if (!hasAssignedWork && !nextGoal) {
          await db
            .update(agents)
            .set({ lastHeartbeatAt: now, updatedAt: now })
            .where(eq(agents.id, agent.id));
          skippedNoWork += 1;
          continue;
        }

        let issueIdForWake: string | null = null;

        // 若沒有已指派的未完成 issue，但公司仍有未完成 Goal，先由後端建立一筆 issue 供 agent checkout。
        // 這能避免不同 adapter 因為流程差異而在「無 issue 時」產生跑偏行為。
        if (!hasAssignedWork && nextGoal) {
          const shouldCreate = !(await agentHasUnfinishedIssueForGoal(agent.companyId, agent.id, nextGoal.id));
          if (shouldCreate) {
            const created = await issuesSvc.create(agent.companyId, {
              goalId: nextGoal.id,
              title: `Goal: ${nextGoal.title}`,
              description: nextGoal.description ?? undefined,
              status: "todo",
              priority: "medium",
              assigneeAgentId: agent.id,
            });
            issueIdForWake = created.id;
          }
        }

        const run = await enqueueWakeup(agent.id, {
          source: "timer",
          triggerDetail: "system",
          reason: "heartbeat_timer",
          requestedByActorType: "system",
          requestedByActorId: "heartbeat_scheduler",
          contextSnapshot: {
            source: "scheduler",
            reason: "interval_elapsed",
            now: now.toISOString(),
          },
          payload: issueIdForWake ? { issueId: issueIdForWake } : null,
        });
        if (run) enqueued += 1;
        else skipped += 1;
      }

      return { checked, enqueued, skipped, skippedNoWork };
    },

    cancelRun: async (runId: string) => {
      const run = await getRun(runId);
      if (!run) throw notFound("Heartbeat run not found");
      if (run.status !== "running" && run.status !== "queued") return run;

      const running = runningProcesses.get(run.id);
      if (running) {
        running.child.kill("SIGTERM");
        const graceMs = Math.max(1, running.graceSec) * 1000;
        setTimeout(() => {
          if (!running.child.killed) {
            running.child.kill("SIGKILL");
          }
        }, graceMs);
      }

      const cancelled = await setRunStatus(run.id, "cancelled", {
        finishedAt: new Date(),
        error: "Cancelled by control plane",
        errorCode: "cancelled",
      });

      await setWakeupStatus(run.wakeupRequestId, "cancelled", {
        finishedAt: new Date(),
        error: "Cancelled by control plane",
      });

      if (cancelled) {
        await appendRunEvent(cancelled, 1, {
          eventType: "lifecycle",
          stream: "system",
          level: "warn",
          message: "run cancelled",
        });
        await releaseIssueExecutionAndPromote(cancelled);
      }

      runningProcesses.delete(run.id);
      await finalizeAgentStatus(run.agentId, "cancelled");
      await startNextQueuedRunForAgent(run.agentId);

      // Cancel any workflow runs associated with this agent in the same scope (chat room)
      const context = parseObject(run.contextSnapshot);
      const roomId = readNonEmptyString(context.roomId);
      if (roomId) {
        await db
          .update(workflowRuns)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(
            and(
              eq(workflowRuns.companyId, run.companyId),
              eq(workflowRuns.agentId, run.agentId),
              eq(workflowRuns.chatRoomId, roomId),
              inArray(workflowRuns.status, [
                "pending",
                "running",
                "waiting_prompt",
                "waiting_checkpoint",
                "waiting_approval",
                "waiting_worker",
                "waiting_child",
              ]),
            ),
          );
      }

      return cancelled;
    },

    cancelActiveForAgent: async (agentId: string) => {
      const runs = await db
        .select()
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.agentId, agentId), inArray(heartbeatRuns.status, ["queued", "running"])));

      for (const run of runs) {
        await setRunStatus(run.id, "cancelled", {
          finishedAt: new Date(),
          error: "Cancelled due to agent pause",
          errorCode: "cancelled",
        });

        await setWakeupStatus(run.wakeupRequestId, "cancelled", {
          finishedAt: new Date(),
          error: "Cancelled due to agent pause",
        });

        const running = runningProcesses.get(run.id);
        if (running) {
          running.child.kill("SIGTERM");
          runningProcesses.delete(run.id);
        }
        await releaseIssueExecutionAndPromote(run);
      }

      // Also cancel any active workflow runs ownership by this agent
      await db
        .update(workflowRuns)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(workflowRuns.agentId, agentId),
            inArray(workflowRuns.status, [
              "pending",
              "running",
              "waiting_prompt",
              "waiting_checkpoint",
              "waiting_approval",
              "waiting_worker",
              "waiting_child",
            ]),
          ),
        );

      return runs.length;
    },

    getActiveRunForAgent: async (agentId: string) => {
      const [run] = await db
        .select()
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.agentId, agentId),
            eq(heartbeatRuns.status, "running"),
          ),
        )
        .orderBy(desc(heartbeatRuns.startedAt))
        .limit(1);
      return run ?? null;
    },
  };
}
