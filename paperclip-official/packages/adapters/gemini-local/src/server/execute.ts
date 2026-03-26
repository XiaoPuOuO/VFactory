import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildChatTranscriptForPrompt,
  type AdapterExecutionContext,
  type AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  mergePaperclipContextIntoEnv,
  renderChatProjectScopeNote,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  parseObject,
  redactEnvForLogs,
  appendAgentCapabilitiesToRenderedPrompt,
  renderTemplate,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "../index.js";
import {
  describeGeminiFailure,
  detectGeminiAuthRequired,
  isGeminiTurnLimitResult,
  isGeminiUnknownSessionError,
  parseGeminiJsonl,
} from "./parse.js";
import { firstNonEmptyLine } from "./utils.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
const PAPERCLIP_SKILLS_CANDIDATES = [
  path.resolve(__moduleDir, "../../skills"),
  path.resolve(__moduleDir, "../../../../../skills"),
  // dev: src/server/ -> repo root/.cursor/skills/ (repo 內實際存放技能的目錄)
  path.resolve(__moduleDir, "../../../../../.cursor/skills"),
];

function hasNonEmptyEnvValue(env: Record<string, string>, key: string): boolean {
  const raw = env[key];
  return typeof raw === "string" && raw.trim().length > 0;
}

function resolveGeminiBillingType(adapterType: string, env: Record<string, string>): "api" | "subscription" {
  if (adapterType === "gemini_remote") return "api";
  if (adapterType === "gemini_local") return "subscription";
  return hasNonEmptyEnvValue(env, "GEMINI_API_KEY") || hasNonEmptyEnvValue(env, "GOOGLE_API_KEY")
    ? "api"
    : "subscription";
}

function renderPaperclipEnvNote(env: Record<string, string>): string {
  const paperclipKeys = Object.keys(env)
    .filter((key) => key.startsWith("PAPERCLIP_"))
    .sort();
  if (paperclipKeys.length === 0) return "";
  return [
    "Paperclip runtime note:",
    `The following PAPERCLIP_* environment variables are available in this run: ${paperclipKeys.join(", ")}`,
    "Do not assume these variables are missing without checking your shell environment.",
    "",
    "",
  ].join("\n");
}

function renderApiAccessNote(env: Record<string, string>): string {
  if (!hasNonEmptyEnvValue(env, "PAPERCLIP_API_URL") || !hasNonEmptyEnvValue(env, "PAPERCLIP_API_KEY")) return "";
  return [
    "Paperclip API access note:",
    "Use run_shell_command with curl to make Paperclip API requests.",
    "GET example:",
    `  run_shell_command({ command: "curl -s -H \\"Authorization: Bearer $PAPERCLIP_API_KEY\\" \\"$PAPERCLIP_API_URL/api/agents/me\\"" })`,
    "POST/PATCH example:",
    `  run_shell_command({ command: "curl -s -X POST -H \\"Authorization: Bearer $PAPERCLIP_API_KEY\\" -H 'Content-Type: application/json' -H \\"X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID\\" -d '{...}' \\"$PAPERCLIP_API_URL/api/issues/{id}/checkout\\"" })`,
    "",
    "",
  ].join("\n");
}

function renderBrowserUseApiNote(env: Record<string, string>): string {
  if (!hasNonEmptyEnvValue(env, "PAPERCLIP_API_URL") || !hasNonEmptyEnvValue(env, "PAPERCLIP_API_KEY")) return "";
  return [
    "Browser-Use tool note:",
    "For browser automation, call Paperclip Browser-Use Tool API endpoints under /api/tools/browser-use/*.",
    "",
    "",
  ].join("\n");
}

async function postChatReplyIfNeeded(opts: {
  env: Record<string, string>;
  summary: string | null | undefined;
  onLog: AdapterExecutionContext["onLog"];
}): Promise<void> {
  const { env, summary, onLog } = opts;
  const body = (summary ?? "").trim();
  if (!body) return;

  const roomId = env.PAPERCLIP_CHAT_ROOM_ID;
  const companyId = env.PAPERCLIP_COMPANY_ID;
  const apiUrl = env.PAPERCLIP_API_URL || process.env.PAPERCLIP_API_URL;
  const apiKey = env.PAPERCLIP_API_KEY || process.env.PAPERCLIP_API_KEY;
  if (!roomId || !companyId || !apiUrl || !apiKey) return;

  const runId = env.PAPERCLIP_RUN_ID;
  const baseUrl = `${apiUrl.replace(/\/+$/, "")}/api/companies/${companyId}/chat/rooms/${roomId}/messages`;

  /** 若本 run 已透過工具（API）發送過訊息，則不再以 summary 重複張貼，避免群組聊天出現兩則相同回覆。 */
  if (runId) {
    try {
      const listRes = await fetch(`${baseUrl}?limit=10`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      });
      if (listRes.ok) {
        const listJson = (await listRes.json()) as unknown;
        if (Array.isArray(listJson)) {
          const alreadyPosted = listJson.some(
            (m: { authorRunId?: string | null }) => m && m.authorRunId === runId,
          );
          if (alreadyPosted) return;
        }
      }
    } catch {
      // 取得失敗時仍嘗試 fallback POST，避免漏回覆
    }
  }

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(runId ? { "X-Paperclip-Run-Id": runId } : {}),
      },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      await onLog(
        "stderr",
        `[paperclip] Failed to POST chat reply (${res.status} ${res.statusText}) to ${baseUrl}\n`,
      );
    }
  } catch (err) {
    await onLog(
      "stderr",
      `[paperclip] Error while POSTing chat reply to ${baseUrl}: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }
}

async function resolvePaperclipSkillsDir(): Promise<string | null> {
  for (const candidate of PAPERCLIP_SKILLS_CANDIDATES) {
    const isDir = await fs.stat(candidate).then((s) => s.isDirectory()).catch(() => false);
    if (isDir) return candidate;
  }
  return null;
}

function geminiSkillsHome(): string {
  return path.join(os.homedir(), ".gemini", "skills");
}

/**
 * Inject Paperclip skills directly into `~/.gemini/skills/` via symlinks.
 * This avoids needing GEMINI_CLI_HOME overrides, so the CLI naturally finds
 * both its auth credentials and the injected skills in the real home directory.
 */
async function ensureGeminiSkillsInjected(
  onLog: AdapterExecutionContext["onLog"],
): Promise<void> {
  const skillsDir = await resolvePaperclipSkillsDir();
  if (!skillsDir) return;

  const skillsHome = geminiSkillsHome();
  try {
    await fs.mkdir(skillsHome, { recursive: true });
  } catch (err) {
    await onLog(
      "stderr",
      `[paperclip] Failed to prepare Gemini skills directory ${skillsHome}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return;
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch (err) {
    await onLog(
      "stderr",
      `[paperclip] Failed to read Paperclip skills from ${skillsDir}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = path.join(skillsDir, entry.name);
    const target = path.join(skillsHome, entry.name);
    const existing = await fs.lstat(target).catch(() => null);
    if (existing) continue;

    try {
      await fs.symlink(source, target);
      await onLog("stderr", `[paperclip] Linked Gemini skill: ${entry.name}\n`);
    } catch (err) {
      await onLog(
        "stderr",
        `[paperclip] Failed to link Gemini skill "${entry.name}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your VFactory work.",
  );
  const command = asString(config.command, "gemini");
  const model = asString(config.model, DEFAULT_GEMINI_LOCAL_MODEL).trim();
  const sandbox = asBoolean(config.sandbox, false);

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const workspaceId = asString(workspaceContext.workspaceId, "");
  const workspaceRepoUrl = asString(workspaceContext.repoUrl, "");
  const workspaceRepoRef = asString(workspaceContext.repoRef, "");
  const workspaceHints = Array.isArray(context.paperclipWorkspaces)
    ? context.paperclipWorkspaces.filter(
      (value): value is Record<string, unknown> => typeof value === "object" && value !== null,
    )
    : [];
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
  await ensureGeminiSkillsInjected(onLog);

  const envConfig = parseObject(config.env);
  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" && envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;
  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim().length > 0
      ? context.wakeReason.trim()
      : null;
  const wakeCommentId =
    (typeof context.wakeCommentId === "string" && context.wakeCommentId.trim().length > 0 && context.wakeCommentId.trim()) ||
    (typeof context.commentId === "string" && context.commentId.trim().length > 0 && context.commentId.trim()) ||
    null;
  const approvalId =
    typeof context.approvalId === "string" && context.approvalId.trim().length > 0
      ? context.approvalId.trim()
      : null;
  const approvalStatus =
    typeof context.approvalStatus === "string" && context.approvalStatus.trim().length > 0
      ? context.approvalStatus.trim()
      : null;
  const linkedIssueIds = Array.isArray(context.issueIds)
    ? context.issueIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;
  if (linkedIssueIds.length > 0) env.PAPERCLIP_LINKED_ISSUE_IDS = linkedIssueIds.join(",");
  const chatRoomId =
    typeof context.roomId === "string" && context.roomId.trim().length > 0 ? context.roomId.trim() : null;
  const chatRoomType =
    context.chatRoomType === "direct" || context.chatRoomType === "group" ? context.chatRoomType : null;
  const chatMessageId =
    typeof context.messageId === "string" && context.messageId.trim().length > 0 ? context.messageId.trim() : null;
  const wakeReasonLabel =
    typeof context.wakeReasonLabel === "string" && context.wakeReasonLabel.trim().length > 0
      ? context.wakeReasonLabel.trim()
      : null;
  const chatMode =
    typeof context.chatMode === "string" && context.chatMode.trim().length > 0
      ? context.chatMode.trim()
      : null;
  if (chatRoomId) {
    env.PAPERCLIP_CHAT_ROOM_ID = chatRoomId;
    env.PAPERCLIP_CHAT_AUTO_REPLY = "1";
  }
  if (chatRoomType) env.PAPERCLIP_CHAT_ROOM_TYPE = chatRoomType;
  if (chatMessageId) env.PAPERCLIP_CHAT_MESSAGE_ID = chatMessageId;
  if (wakeReasonLabel) env.PAPERCLIP_WAKE_REASON_LABEL = wakeReasonLabel;
  if (chatMode) env.PAPERCLIP_CHAT_MODE = chatMode;
  const chatProjectId =
    typeof context.chatProjectId === "string" && context.chatProjectId.trim().length > 0
      ? context.chatProjectId.trim()
      : null;
  const chatProjectName =
    typeof context.chatProjectName === "string" && context.chatProjectName.trim().length > 0
      ? context.chatProjectName.trim()
      : null;
  if (chatProjectId) env.PAPERCLIP_CHAT_PROJECT_ID = chatProjectId;
  if (chatProjectName) env.PAPERCLIP_CHAT_PROJECT_NAME = chatProjectName;
  if (effectiveWorkspaceCwd) env.PAPERCLIP_WORKSPACE_CWD = effectiveWorkspaceCwd;
  if (workspaceSource) env.PAPERCLIP_WORKSPACE_SOURCE = workspaceSource;
  if (workspaceId) env.PAPERCLIP_WORKSPACE_ID = workspaceId;
  if (workspaceRepoUrl) env.PAPERCLIP_WORKSPACE_REPO_URL = workspaceRepoUrl;
  if (workspaceRepoRef) env.PAPERCLIP_WORKSPACE_REPO_REF = workspaceRepoRef;
  if (workspaceHints.length > 0) env.PAPERCLIP_WORKSPACES_JSON = JSON.stringify(workspaceHints);

  mergePaperclipContextIntoEnv(env, context);

  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  if (!hasExplicitApiKey && authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }
  const billingType = resolveGeminiBillingType(agent.adapterType ?? "", env);
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, cwd, runtimeEnv);

  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);
  const extraArgs = (() => {
    const fromExtraArgs = asStringArray(config.extraArgs);
    if (fromExtraArgs.length > 0) return fromExtraArgs;
    return asStringArray(config.args);
  })();

  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? "");
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "");
  const canResumeSession =
    runtimeSessionId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(cwd));
  const sessionId = canResumeSession ? runtimeSessionId : null;
  if (runtimeSessionId && !canResumeSession) {
    await onLog(
      "stderr",
      `[paperclip] Gemini session "${runtimeSessionId}" was saved for cwd "${runtimeSessionCwd}" and will not be resumed in "${cwd}".\n`,
    );
  }

  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  const instructionsDir = instructionsFilePath ? `${path.dirname(instructionsFilePath)}/` : "";
  let instructionsPrefix = "";
  if (instructionsFilePath) {
    try {
      const instructionsContents = await fs.readFile(instructionsFilePath, "utf8");
      instructionsPrefix =
        `${instructionsContents}\n\n` +
        `The above agent instructions were loaded from ${instructionsFilePath}. ` +
        `Resolve any relative file references from ${instructionsDir}.\n\n`;
      await onLog(
        "stderr",
        `[paperclip] Loaded agent instructions file: ${instructionsFilePath}\n`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await onLog(
        "stderr",
        `[paperclip] Warning: could not read agent instructions file "${instructionsFilePath}": ${reason}\n`,
      );
    }
  }
  const commandNotes = (() => {
    const notes: string[] = ["Prompt is passed to Gemini as the final positional argument."];
    notes.push("Added --approval-mode yolo for unattended execution.");
    if (!instructionsFilePath) return notes;
    if (instructionsPrefix.length > 0) {
      notes.push(
        `Loaded agent instructions from ${instructionsFilePath}`,
        `Prepended instructions + path directive to prompt (relative references from ${instructionsDir}).`,
      );
      return notes;
    }
    notes.push(
      `Configured instructionsFilePath ${instructionsFilePath}, but file could not be read; continuing without injected instructions.`,
    );
    return notes;
  })();

  const chatTranscript = await buildChatTranscriptForPrompt({ env, onLog }).catch(() => null);
  const crossChatSummary =
    context && typeof context === "object" && typeof (context as Record<string, unknown>).crossChatMemorySummary === "string"
      ? ((context as Record<string, unknown>).crossChatMemorySummary as string).trim()
      : "";
  const roomEarlierSummary =
    context && typeof context === "object" && typeof (context as Record<string, unknown>).roomEarlierSummary === "string"
      ? ((context as Record<string, unknown>).roomEarlierSummary as string).trim()
      : "";

  const paperclipCompany =
    (context && typeof context === "object" && (context as Record<string, unknown>).paperclipCompany) as
      | { id: string; name: string; description: string | null; issuePrefix: string }
      | undefined;
  const company = paperclipCompany ?? { id: agent.companyId, name: "", description: null, issuePrefix: "PAP" };
  const renderedPrompt = appendAgentCapabilitiesToRenderedPrompt(
    promptTemplate,
    renderTemplate(promptTemplate, {
      agentId: agent.id,
      companyId: agent.companyId,
      runId,
      company,
      agent,
      run: { id: runId, source: "on_demand" },
      context,
    }),
    agent,
  );
  const chatRoomIdForPrompt = env.PAPERCLIP_CHAT_ROOM_ID;
  const chatRoomTypeForPrompt = env.PAPERCLIP_CHAT_ROOM_TYPE;
  const wakeReasonLabelForPrompt = env.PAPERCLIP_WAKE_REASON_LABEL;
  const chatModePrefix =
    chatRoomIdForPrompt && chatRoomTypeForPrompt
      ? [
          "You are in a live VFactory chat room. This heartbeat is one conversational turn.",
          "Reply in the user's language (usually Traditional Chinese), concise and professional.",
          "You MUST post the reply via POST /api/companies/$PAPERCLIP_COMPANY_ID/chat/rooms/$PAPERCLIP_CHAT_ROOM_ID/messages with {\"body\":\"...\"} and header X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID.",
          "Do not only inspect issues and exit; respond directly to the latest Board message in this room.",
          "你是公司 CEO 代理人，正在回覆董事長；先回答，再視需要拆任務。",
          wakeReasonLabelForPrompt ? `Wake context: ${wakeReasonLabelForPrompt}` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const crossChatBlock =
    crossChatSummary !== ""
      ? `Cross-chat context (brief; things you remembered across conversations):\n${crossChatSummary}\n\n`
      : "";
  const roomEarlierBlock =
    roomEarlierSummary !== ""
      ? `Earlier in this room (summary):\n${roomEarlierSummary}\n\n`
      : "";
  const chatHistoryBlock = chatTranscript
    ? `Here is the recent chat transcript for this room (oldest first, newest last). Read it carefully and respond to the latest user message.\n\n${chatTranscript}\n\n`
    : "";
  const paperclipEnvNote = renderPaperclipEnvNote(env);
  const apiAccessNote = renderApiAccessNote(env);
  const browserUseApiNote = renderBrowserUseApiNote(env);
  const prompt = `${instructionsPrefix}${paperclipEnvNote}${apiAccessNote}${browserUseApiNote}${chatModePrefix}${renderChatProjectScopeNote(env)}${crossChatBlock}${roomEarlierBlock}${chatHistoryBlock}${renderedPrompt}`;

  const buildArgs = (resumeSessionId: string | null) => {
    const args = ["--output-format", "stream-json"];
    if (resumeSessionId) args.push("--resume", resumeSessionId);
    if (model && model !== DEFAULT_GEMINI_LOCAL_MODEL) args.push("--model", model);
    args.push("--approval-mode", "yolo");
    if (sandbox) {
      args.push("--sandbox");
    } else {
      args.push("--sandbox=none");
    }
    if (extraArgs.length > 0) args.push(...extraArgs);
    args.push(prompt);
    return args;
  };

  const runAttempt = async (resumeSessionId: string | null) => {
    const args = buildArgs(resumeSessionId);
    if (onMeta) {
      await onMeta({
        adapterType: "gemini_local",
        command,
        cwd,
        commandNotes,
        commandArgs: args.map((value, index) => (
          index === args.length - 1 ? `<prompt ${prompt.length} chars>` : value
        )),
        env: redactEnvForLogs(env),
        prompt,
        context,
      });
    }

    const proc = await runChildProcess(runId, command, args, {
      cwd,
      env,
      timeoutSec,
      graceSec,
      onLog,
    });
    return {
      proc,
      parsed: parseGeminiJsonl(proc.stdout),
    };
  };

  const toResult = (
    attempt: {
      proc: {
        exitCode: number | null;
        signal: string | null;
        timedOut: boolean;
        stdout: string;
        stderr: string;
      };
      parsed: ReturnType<typeof parseGeminiJsonl>;
    },
    clearSessionOnMissingSession = false,
    isRetry = false,
  ): AdapterExecutionResult => {
    const authMeta = detectGeminiAuthRequired({
      parsed: attempt.parsed.resultEvent,
      stdout: attempt.proc.stdout,
      stderr: attempt.proc.stderr,
    });

    if (attempt.proc.timedOut) {
      return {
        exitCode: attempt.proc.exitCode,
        signal: attempt.proc.signal,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        errorCode: authMeta.requiresAuth ? "gemini_auth_required" : null,
        clearSession: clearSessionOnMissingSession,
      };
    }

    const clearSessionForTurnLimit = isGeminiTurnLimitResult(attempt.parsed.resultEvent, attempt.proc.exitCode);

    // On retry, don't fall back to old session ID — the old session was stale
    const canFallbackToRuntimeSession = !isRetry;
    const resolvedSessionId = attempt.parsed.sessionId
      ?? (canFallbackToRuntimeSession ? (runtimeSessionId ?? runtime.sessionId ?? null) : null);
    const resolvedSessionParams = resolvedSessionId
      ? ({
        sessionId: resolvedSessionId,
        cwd,
        ...(workspaceId ? { workspaceId } : {}),
        ...(workspaceRepoUrl ? { repoUrl: workspaceRepoUrl } : {}),
        ...(workspaceRepoRef ? { repoRef: workspaceRepoRef } : {}),
      } as Record<string, unknown>)
      : null;
    const parsedError = typeof attempt.parsed.errorMessage === "string" ? attempt.parsed.errorMessage.trim() : "";
    const stderrLine = firstNonEmptyLine(attempt.proc.stderr);
    const structuredFailure = attempt.parsed.resultEvent
      ? describeGeminiFailure(attempt.parsed.resultEvent)
      : null;
    const fallbackErrorMessage =
      parsedError ||
      structuredFailure ||
      stderrLine ||
      `Gemini exited with code ${attempt.proc.exitCode ?? -1}`;

    return {
      exitCode: attempt.proc.exitCode,
      signal: attempt.proc.signal,
      timedOut: false,
      errorMessage: (attempt.proc.exitCode ?? 0) === 0 ? null : fallbackErrorMessage,
      errorCode: (attempt.proc.exitCode ?? 0) !== 0 && authMeta.requiresAuth ? "gemini_auth_required" : null,
      usage: attempt.parsed.usage,
      sessionId: resolvedSessionId,
      sessionParams: resolvedSessionParams,
      sessionDisplayId: resolvedSessionId,
      provider: "google",
      model,
      billingType,
      costUsd: attempt.parsed.costUsd,
      resultJson: attempt.parsed.resultEvent ?? {
        stdout: attempt.proc.stdout,
        stderr: attempt.proc.stderr,
      },
      summary: attempt.parsed.summary,
      question: attempt.parsed.question,
      clearSession: clearSessionForTurnLimit || Boolean(clearSessionOnMissingSession && !resolvedSessionId),
    };
  };

  const initial = await runAttempt(sessionId);
  if (
    !initial.proc.timedOut &&
    (initial.proc.exitCode ?? 0) === 0 &&
    env.PAPERCLIP_CHAT_AUTO_REPLY === "1"
  ) {
    await postChatReplyIfNeeded({
      env,
      summary: initial.parsed.summary,
      onLog,
    });
  }
  if (
    sessionId &&
    !initial.proc.timedOut &&
    (initial.proc.exitCode ?? 0) !== 0 &&
    isGeminiUnknownSessionError(initial.proc.stdout, initial.proc.stderr)
  ) {
    await onLog(
      "stderr",
      `[paperclip] Gemini resume session "${sessionId}" is unavailable; retrying with a fresh session.\n`,
    );
    const retry = await runAttempt(null);
    if (
      !retry.proc.timedOut &&
      (retry.proc.exitCode ?? 0) === 0 &&
      env.PAPERCLIP_CHAT_AUTO_REPLY === "1"
    ) {
      await postChatReplyIfNeeded({
        env,
        summary: retry.parsed.summary,
        onLog,
      });
    }
    return toResult(retry, true, true);
  }

  return toResult(initial);
}
