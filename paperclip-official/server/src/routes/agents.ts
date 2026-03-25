import { Router, type Request } from "express";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { agents as agentsTable, companies, heartbeatRuns } from "@paperclipai/db";
import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import {
  addAgentMemorySchema,
  createAgentKeySchema,
  createAgentHireSchema,
  createAgentSchema,
  decodeHeartbeatRunCursor,
  heartbeatRunsListQuerySchema,
  heartbeatRunsQualityQuerySchema,
  isUuidLike,
  parseHeartbeatRunsListInvocationSources,
  parseHeartbeatRunsListStatuses,
  resetAgentSessionSchema,
  testAdapterEnvironmentSchema,
  updateAgentPermissionsSchema,
  updateAgentInstructionsPathSchema,
  wakeAgentSchema,
  updateAgentSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  agentMemoriesService,
  agentService,
  accessService,
  approvalService,
  companyApprovalPolicyService,
  companyService,
  costService,
  heartbeatService,
  runQualityService,
  issueApprovalService,
  issueService,
  logActivity,
  scheduleCompanyNotificationEvent,
  secretService,
} from "../services/index.js";
import { runApprovalApprovedFollowUp } from "../services/approval-follow-up.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { computeAutoPauseFields } from "../lib/auto-pause.js";
import { assertBoard, assertCompanyAccess, getActorInfo, hasCompanyViewAll } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";
import { findServerAdapter, listAdapterModels } from "../adapters/index.js";
import { testCloudConnection, isCloudAdapter } from "../adapters/cloud-connection-test.js";
import { redactEventPayload } from "../redaction.js";
import { redactCurrentUserValue } from "../log-redaction.js";
import { runClaudeLogin } from "@paperclipai/adapter-claude-local/server";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { ensureOpenCodeModelConfiguredAndAvailable } from "@paperclipai/adapter-opencode-local/server";

export function agentRoutes(db: Db) {
  const DEFAULT_INSTRUCTIONS_PATH_KEYS: Record<string, string> = {
    claude_local: "instructionsFilePath",
    claude_remote: "instructionsFilePath",
    codex_local: "instructionsFilePath",
    codex_remote: "instructionsFilePath",
    gemini_local: "instructionsFilePath",
    gemini_remote: "instructionsFilePath",
    opencode_local: "instructionsFilePath",
    cursor: "instructionsFilePath",
  };
  const KNOWN_INSTRUCTIONS_PATH_KEYS = new Set(["instructionsFilePath", "agentsMdPath"]);

  const router = Router();
  const svc = agentService(db);
  const access = accessService(db);
  const costs = costService(db);
  const memoriesSvc = agentMemoriesService(db);
  const approvalsSvc = approvalService(db);
  const hireApprovalPolicies = companyApprovalPolicyService(db);
  const heartbeat = heartbeatService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const secretsSvc = secretService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  function canCreateAgents(agent: { role: string; permissions: Record<string, unknown> | null | undefined }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function assertCanCreateAgentsForCompany(req: Request, companyId: string) {
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "banned") throw forbidden("Account banned");
    if (req.actor.type === "board") {
      if (hasCompanyViewAll(req)) return null;
      const allowed = await access.canUser(companyId, req.actor.userId, "agents:create");
      if (!allowed) {
        throw forbidden("Missing permission: agents:create");
      }
      return null;
    }
    if (!req.actor.agentId) throw forbidden("Agent authentication required");
    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    if (!allowedByGrant && !canCreateAgents(actorAgent)) {
      throw forbidden("Missing permission: can create agents");
    }
    return actorAgent;
  }

  async function assertCanReadConfigurations(req: Request, companyId: string) {
    return assertCanCreateAgentsForCompany(req, companyId);
  }

  async function actorCanReadConfigurationsForCompany(req: Request, companyId: string) {
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "banned") return false;
    if (req.actor.type === "board") {
      if (hasCompanyViewAll(req)) return true;
      return access.canUser(companyId, req.actor.userId, "agents:create");
    }
    if (!req.actor.agentId) return false;
    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) return false;
    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    return allowedByGrant || canCreateAgents(actorAgent);
  }

  /** Board、本人或 CEO 可見 `projects:manage` grant 狀態（供設定頁開關）。 */
  async function shouldExposePrincipalProjectFlags(req: Request, targetAgentId: string): Promise<boolean> {
    if (req.actor.type === "board") return true;
    if (req.actor.type !== "agent" || !req.actor.agentId) return false;
    if (req.actor.agentId === targetAgentId) return true;
    const actorAgent = await svc.getById(req.actor.agentId);
    return actorAgent?.role === "ceo";
  }

  async function withPrincipalPermissionFields<A extends { id: string; companyId: string }>(
    req: Request,
    agent: A,
  ): Promise<A & { canManageProjects?: boolean }> {
    if (!(await shouldExposePrincipalProjectFlags(req, agent.id))) {
      return agent;
    }
    const canManageProjects = await access.hasPermission(agent.companyId, "agent", agent.id, "projects:manage");
    return { ...agent, canManageProjects };
  }

  async function assertCanUpdateAgent(req: Request, targetAgent: { id: string; companyId: string }) {
    await assertCompanyAccess(req, targetAgent.companyId, db);
    if (req.actor.type === "banned") throw forbidden("Account banned");
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
      throw forbidden("Agent key cannot access another company");
    }

    if (actorAgent.id === targetAgent.id) return;
    if (actorAgent.role === "ceo") return;
    const allowedByGrant = await access.hasPermission(
      targetAgent.companyId,
      "agent",
      actorAgent.id,
      "agents:create",
    );
    if (allowedByGrant || canCreateAgents(actorAgent)) return;
    throw forbidden("Only CEO or agent creators can modify other agents");
  }

  async function resolveCompanyIdForAgentReference(req: Request): Promise<string | null> {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      await assertCompanyAccess(req, requestedCompanyId, db);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    if (req.actor.type === "service" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeAgentReference(req: Request, rawId: string): Promise<string> {
    const raw = rawId.trim();
    if (isUuidLike(raw)) return raw;

    const companyId = await resolveCompanyIdForAgentReference(req);
    if (!companyId) {
      throw unprocessable("Agent shortname lookup requires companyId query parameter");
    }

    const resolved = await svc.resolveByReference(companyId, raw);
    if (resolved.ambiguous) {
      throw conflict("Agent shortname is ambiguous in this company. Use the agent ID.");
    }
    if (!resolved.agent) {
      throw notFound("Agent not found");
    }
    return resolved.agent.id;
  }

  function parseSourceIssueIds(input: {
    sourceIssueId?: string | null;
    sourceIssueIds?: string[];
  }): string[] {
    const values: string[] = [];
    if (Array.isArray(input.sourceIssueIds)) values.push(...input.sourceIssueIds);
    if (typeof input.sourceIssueId === "string" && input.sourceIssueId.length > 0) {
      values.push(input.sourceIssueId);
    }
    return Array.from(new Set(values));
  }

  function asRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function parseBooleanLike(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    }
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
      return false;
    }
    return null;
  }

  function parseNumberLike(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return null;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function generateEd25519PrivateKeyPem(): string {
    const { privateKey } = generateKeyPairSync("ed25519");
    return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }

  function ensureGatewayDeviceKey(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    if (adapterType !== "openclaw_gateway") return adapterConfig;
    const disableDeviceAuth = parseBooleanLike(adapterConfig.disableDeviceAuth) === true;
    if (disableDeviceAuth) return adapterConfig;
    if (asNonEmptyString(adapterConfig.devicePrivateKeyPem)) return adapterConfig;
    return { ...adapterConfig, devicePrivateKeyPem: generateEd25519PrivateKeyPem() };
  }

  function applyCreateDefaultsByAdapterType(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const next = { ...adapterConfig };
    if (adapterType === "codex_local" || adapterType === "codex_remote") {
      if (!asNonEmptyString(next.model)) {
        next.model = DEFAULT_CODEX_LOCAL_MODEL;
      }
      const hasBypassFlag =
        typeof next.dangerouslyBypassApprovalsAndSandbox === "boolean" ||
        typeof next.dangerouslyBypassSandbox === "boolean";
      if (!hasBypassFlag) {
        next.dangerouslyBypassApprovalsAndSandbox = DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
      }
      return ensureGatewayDeviceKey(adapterType, next);
    }
    if ((adapterType === "gemini_local" || adapterType === "gemini_remote") && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_GEMINI_LOCAL_MODEL;
      return ensureGatewayDeviceKey(adapterType, next);
    }
    // OpenCode requires explicit model selection — no default
    if (adapterType === "cursor" && !asNonEmptyString(next.model)) {
      next.model = DEFAULT_CURSOR_LOCAL_MODEL;
    }
    return ensureGatewayDeviceKey(adapterType, next);
  }

  /** Only remote adapters require API Key; local adapters must not set it. */
  const NON_ADMIN_API_KEY_KEYS: Record<string, string[]> = {
    claude_remote: ["ANTHROPIC_API_KEY"],
    codex_remote: ["OPENAI_API_KEY"],
    gemini_remote: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  };

  /** For local adapters, strip these env keys on persist so API Key is never stored. */
  const LOCAL_ADAPTER_STRIP_ENV_KEYS: Record<string, string[]> = {
    claude_local: ["ANTHROPIC_API_KEY"],
    codex_local: ["OPENAI_API_KEY"],
    gemini_local: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  };

  function envHasApiKeySet(env: unknown, keys: string[]): boolean {
    const record = asRecord(env);
    if (!record) return false;
    for (const key of keys) {
      const binding = record[key];
      if (binding === undefined || binding === null) continue;
      if (typeof binding === "string") {
        if (binding.trim() !== "") return true;
        continue;
      }
      if (typeof binding === "object" && binding !== null) {
        const o = binding as Record<string, unknown>;
        if (o.type === "plain" && typeof o.value === "string" && o.value.trim() !== "") return true;
        if (o.type === "secret_ref" && typeof o.secretId === "string" && o.secretId.trim() !== "") return true;
      }
    }
    return false;
  }

  async function assertAdapterAllowed(companyId: string, req: Request, adapterType: string | null | undefined) {
    if (!adapterType) return;
    const allowed = await access.getAllowedAdapterTypes(
      companyId,
      req.actor.type === "board" ? req.actor.userId : null,
      hasCompanyViewAll(req),
    );
    if (!allowed.includes(adapterType)) {
      throw forbidden(
        "You do not have permission to use this adapter type in this company. Required permission: model.<adapter> (e.g. model.claude.remote).",
      );
    }
  }

  /** Remove API Key env keys from adapterConfig for local adapters so they are never persisted. */
  function stripLocalAdapterApiKeys(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const keysToStrip = adapterType ? LOCAL_ADAPTER_STRIP_ENV_KEYS[adapterType] : undefined;
    if (!keysToStrip?.length || !Object.prototype.hasOwnProperty.call(adapterConfig, "env")) {
      return adapterConfig;
    }
    const env = asRecord(adapterConfig.env);
    if (!env) return adapterConfig;
    const nextEnv = { ...env };
    let changed = false;
    for (const key of keysToStrip) {
      if (key in nextEnv) {
        delete nextEnv[key];
        changed = true;
      }
    }
    if (!changed) return adapterConfig;
    return { ...adapterConfig, env: nextEnv };
  }

  function assertNonAdminApiKeyRequired(
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
    req: Request,
  ) {
    if (hasCompanyViewAll(req)) return;
    const keys = adapterType ? NON_ADMIN_API_KEY_KEYS[adapterType] : undefined;
    if (!keys) return;
    const env = asRecord(adapterConfig.env);
    if (!envHasApiKeySet(env, keys)) {
      const keyNames = keys.join(" or ");
      throw unprocessable(
        `Non-admin users must set ${keyNames} in adapter environment (adapterConfig.env) for this adapter.`,
      );
    }
  }

  async function assertAdapterConfigConstraints(
    companyId: string,
    adapterType: string | null | undefined,
    adapterConfig: Record<string, unknown>,
  ) {
    if (adapterType !== "opencode_local") return;
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(companyId, adapterConfig);
    const runtimeEnv = asRecord(runtimeConfig.env) ?? {};
    try {
      await ensureOpenCodeModelConfiguredAndAvailable({
        model: runtimeConfig.model,
        command: runtimeConfig.command,
        cwd: runtimeConfig.cwd,
        env: runtimeEnv,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw unprocessable(`Invalid opencode_local adapterConfig: ${reason}`);
    }
  }

  function resolveInstructionsFilePath(candidatePath: string, adapterConfig: Record<string, unknown>) {
    const trimmed = candidatePath.trim();
    if (path.isAbsolute(trimmed)) return trimmed;

    const cwd = asNonEmptyString(adapterConfig.cwd);
    if (!cwd) {
      throw unprocessable(
        "Relative instructions path requires adapterConfig.cwd to be set to an absolute path",
      );
    }
    if (!path.isAbsolute(cwd)) {
      throw unprocessable("adapterConfig.cwd must be an absolute path to resolve relative instructions path");
    }
    return path.resolve(cwd, trimmed);
  }

  async function assertCanManageInstructionsPath(req: Request, targetAgent: { id: string; companyId: string }) {
    await assertCompanyAccess(req, targetAgent.companyId, db);
    if (req.actor.type === "banned") throw forbidden("Account banned");
    if (req.actor.type === "board") return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");

    const actorAgent = await svc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== targetAgent.companyId) {
      throw forbidden("Agent key cannot access another company");
    }
    if (actorAgent.id === targetAgent.id) return;

    const chainOfCommand = await svc.getChainOfCommand(targetAgent.id);
    if (chainOfCommand.some((manager) => manager.id === actorAgent.id)) return;

    throw forbidden("Only the target agent or an ancestor manager can update instructions path");
  }

  function summarizeAgentUpdateDetails(patch: Record<string, unknown>) {
    const changedTopLevelKeys = Object.keys(patch).sort();
    const details: Record<string, unknown> = { changedTopLevelKeys };

    const adapterConfigPatch = asRecord(patch.adapterConfig);
    if (adapterConfigPatch) {
      details.changedAdapterConfigKeys = Object.keys(adapterConfigPatch).sort();
    }

    const runtimeConfigPatch = asRecord(patch.runtimeConfig);
    if (runtimeConfigPatch) {
      details.changedRuntimeConfigKeys = Object.keys(runtimeConfigPatch).sort();
    }

    return details;
  }

  function redactForRestrictedAgentView(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      ...agent,
      adapterConfig: {},
      runtimeConfig: {},
    };
  }

  function redactAgentConfiguration(agent: Awaited<ReturnType<typeof svc.getById>>) {
    if (!agent) return null;
    return {
      id: agent.id,
      companyId: agent.companyId,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      status: agent.status,
      reportsTo: agent.reportsTo,
      adapterType: agent.adapterType,
      adapterConfig: redactEventPayload(agent.adapterConfig),
      runtimeConfig: redactEventPayload(agent.runtimeConfig),
      permissions: agent.permissions,
      updatedAt: agent.updatedAt,
    };
  }

  function redactRevisionSnapshot(snapshot: unknown): Record<string, unknown> {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
    const record = snapshot as Record<string, unknown>;
    return {
      ...record,
      adapterConfig: redactEventPayload(
        typeof record.adapterConfig === "object" && record.adapterConfig !== null
          ? (record.adapterConfig as Record<string, unknown>)
          : {},
      ),
      runtimeConfig: redactEventPayload(
        typeof record.runtimeConfig === "object" && record.runtimeConfig !== null
          ? (record.runtimeConfig as Record<string, unknown>)
          : {},
      ),
      metadata:
        typeof record.metadata === "object" && record.metadata !== null
          ? redactEventPayload(record.metadata as Record<string, unknown>)
          : record.metadata ?? null,
    };
  }

  function redactConfigRevision(
    revision: Record<string, unknown> & { beforeConfig: unknown; afterConfig: unknown },
  ) {
    return {
      ...revision,
      beforeConfig: redactRevisionSnapshot(revision.beforeConfig),
      afterConfig: redactRevisionSnapshot(revision.afterConfig),
    };
  }

  function toLeanOrgNode(
    node: Record<string, unknown>,
    companyReason: "token_limit" | "price_limit" | null,
  ): Record<string, unknown> {
    const reports = Array.isArray(node.reports)
      ? (node.reports as Array<Record<string, unknown>>).map((report) =>
          toLeanOrgNode(report, companyReason),
        )
      : [];
    const status = String(node.status);
    const { autoPaused, autoPauseReason } = computeAutoPauseFields(
      {
        status,
        autoPauseReason:
          typeof node.autoPauseReason === "string" || node.autoPauseReason === null
            ? (node.autoPauseReason as string | null)
            : null,
      },
      companyReason,
    );
    return {
      id: String(node.id),
      name: String(node.name),
      role: String(node.role),
      status,
      autoPaused,
      autoPauseReason,
      reports,
    };
  }

  /** 為 API 回傳加上 autoPaused / autoPauseReason（含公司層級 Token/Price 上限）。 */
  async function withAutoPauseFields<T extends { status: string; autoPauseReason?: string | null; companyId: string }>(
    agent: T,
  ): Promise<T & { autoPaused: boolean; autoPauseReason: string | null }> {
    const limitExceeded = await costs.isCompanyLimitExceeded(agent.companyId);
    const { autoPaused, autoPauseReason } = computeAutoPauseFields(agent, limitExceeded.reason);
    return { ...agent, autoPaused, autoPauseReason };
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeAgentReference(req, String(rawId));
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/adapters/:type/models", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const type = req.params.type as string;
    const models = await listAdapterModels(type);
    res.json(models);
  });

  router.post(
    "/companies/:companyId/adapters/:type/test-environment",
    validate(testAdapterEnvironmentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const type = req.params.type as string;
      await assertCanReadConfigurations(req, companyId);

      const adapter = findServerAdapter(type);
      if (!adapter) {
        res.status(404).json({ error: `Unknown adapter type: ${type}` });
        return;
      }

      const inputAdapterConfig =
        (req.body?.adapterConfig ?? {}) as Record<string, unknown>;
      const normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        inputAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      const { config: runtimeAdapterConfig } = await secretsSvc.resolveAdapterConfigForRuntime(
        companyId,
        normalizedAdapterConfig,
      );

      if (isCloudAdapter(type)) {
        const result = await testCloudConnection(type, runtimeAdapterConfig);
        res.json(result);
        return;
      }

      const result = await adapter.testEnvironment({
        companyId,
        adapterType: type,
        config: runtimeAdapterConfig,
      });

      res.json(result);
    },
  );

  router.get("/companies/:companyId/agents", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const result = await svc.list(companyId);
    const withPause = await Promise.all(result.map((agent) => withAutoPauseFields(agent)));
    const canReadConfigs = await actorCanReadConfigurationsForCompany(req, companyId);
    if (canReadConfigs || req.actor.type === "board") {
      res.json(withPause);
      return;
    }
    res.json(withPause.map((agent) => redactForRestrictedAgentView(agent)));
  });

  router.get("/companies/:companyId/org", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const tree = await svc.orgForCompany(companyId);
    const limitExceeded = await costs.isCompanyLimitExceeded(companyId);
    const companyReason = limitExceeded.reason;
    const leanTree = tree.map((node) => toLeanOrgNode(node as Record<string, unknown>, companyReason));
    res.json(leanTree);
  });

  router.get("/companies/:companyId/agent-configurations", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanReadConfigurations(req, companyId);
    const rows = await svc.list(companyId);
    res.json(rows.map((row) => redactAgentConfiguration(row)));
  });

  router.get("/agents/me", async (req, res) => {
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      res.status(401).json({ error: "Agent authentication required" });
      return;
    }
    const agent = await svc.getById(req.actor.agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    const chainOfCommand = await svc.getChainOfCommand(agent.id);
    const enriched = await withPrincipalPermissionFields(req, agent);
    res.json({ ...enriched, chainOfCommand });
  });

  /** Agent 寫入一筆跨聊天記憶（僅該 agent 的 Bearer 可呼叫）。 */
  router.post(
    "/companies/:companyId/agents/me/memories",
    validate(addAgentMemorySchema),
    async (req, res) => {
      if (req.actor.type !== "agent" || !req.actor.agentId) {
        res.status(401).json({ error: "Agent authentication required" });
        return;
      }
      const companyId = req.params.companyId as string;
      await assertCompanyAccess(req, companyId, db);
      const agent = await svc.getById(req.actor.agentId);
      if (!agent || agent.companyId !== companyId) {
        res.status(403).json({ error: "Agent key cannot access another company" });
        return;
      }
      const body = req.body as { content: string; sourceRoomId?: string | null };
      const memory = await memoriesSvc.add(
        companyId,
        agent.id,
        body.content,
        body.sourceRoomId ?? null,
      );
      res.status(201).json(memory);
    },
  );

  /** 列出該 agent 的跨聊天記憶（board 或 agent 本人；agentId 可為 "me" 表示本人）。支援 query: q, sourceRoomId, limit。 */
  router.get("/companies/:companyId/agents/:agentId/memories", async (req, res) => {
    const companyId = req.params.companyId as string;
    let agentId = req.params.agentId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot read agent memories" });
      return;
    }
    if (agentId === "me") {
      if (req.actor.type !== "agent" || !req.actor.agentId) {
        res.status(401).json({ error: "Agent authentication required" });
        return;
      }
      agentId = req.actor.agentId;
    } else if (req.actor.type === "agent" && req.actor.agentId !== agentId) {
      res.status(403).json({ error: "Agent can only read own memories" });
      return;
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim() || undefined : undefined;
    const sourceRoomId =
      typeof req.query.sourceRoomId === "string" ? req.query.sourceRoomId.trim() || undefined : undefined;
    const limitParam = parseNumberLike(req.query.limit);
    const limit =
      limitParam != null && limitParam > 0 ? Math.min(500, Math.max(1, limitParam)) : undefined;
    const list = await memoriesSvc.list(companyId, agentId, { q, sourceRoomId, limit });
    res.json(list);
  });

  /** 刪除該 agent 的單筆記憶。 */
  router.delete("/companies/:companyId/agents/:agentId/memories/:memoryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    let agentId = req.params.agentId as string;
    const memoryId = req.params.memoryId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete agent memories" });
      return;
    }
    if (agentId === "me") {
      if (req.actor.type !== "agent" || !req.actor.agentId) {
        res.status(401).json({ error: "Agent authentication required" });
        return;
      }
      agentId = req.actor.agentId;
    } else if (req.actor.type === "agent" && req.actor.agentId !== agentId) {
      res.status(403).json({ error: "Agent can only delete own memories" });
      return;
    }
    await memoriesSvc.deleteOne(companyId, agentId, memoryId);
    res.status(204).send();
  });

  /** 刪除該 agent 的全部記憶。 */
  router.delete("/companies/:companyId/agents/:agentId/memories", async (req, res) => {
    const companyId = req.params.companyId as string;
    let agentId = req.params.agentId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete agent memories" });
      return;
    }
    if (agentId === "me") {
      if (req.actor.type !== "agent" || !req.actor.agentId) {
        res.status(401).json({ error: "Agent authentication required" });
        return;
      }
      agentId = req.actor.agentId;
    } else {
      await assertCompanyPermission(db, req, companyId, "agents:admin");
    }
    if (req.actor.type === "agent" && req.actor.agentId !== agentId) {
      res.status(403).json({ error: "Agent can only delete own memories" });
      return;
    }
    await memoriesSvc.deleteAll(companyId, agentId);
    res.status(204).send();
  });

  router.get("/agents/:id", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, agent.companyId, "agents:read");
    const withPause = await withAutoPauseFields(agent);
    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      const canRead = await actorCanReadConfigurationsForCompany(req, agent.companyId);
      if (!canRead) {
        const chainOfCommand = await svc.getChainOfCommand(agent.id);
        const redacted = redactForRestrictedAgentView(withPause);
        const enriched = redacted ? await withPrincipalPermissionFields(req, redacted) : redacted;
        res.json({ ...enriched, chainOfCommand });
        return;
      }
    }
    const chainOfCommand = await svc.getChainOfCommand(agent.id);
    const enriched = await withPrincipalPermissionFields(req, withPause);
    res.json({ ...enriched, chainOfCommand });
  });

  router.get("/agents/:id/configuration", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    res.json(redactAgentConfiguration(agent));
  });

  router.get("/agents/:id/config-revisions", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revisions = await svc.listConfigRevisions(id);
    res.json(revisions.map((revision) => redactConfigRevision(revision)));
  });

  router.get("/agents/:id/config-revisions/:revisionId", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanReadConfigurations(req, agent.companyId);
    const revision = await svc.getConfigRevision(id, revisionId);
    if (!revision) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }
    res.json(redactConfigRevision(revision));
  });

  router.post("/agents/:id/config-revisions/:revisionId/rollback", async (req, res) => {
    const id = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    const actor = getActorInfo(req);
    const updated = await svc.rollbackConfigRevision(id, revisionId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });
    if (!updated) {
      res.status(404).json({ error: "Revision not found" });
      return;
    }

    await logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.config_rolled_back",
      entityType: "agent",
      entityId: updated.id,
      details: { revisionId },
    });

    res.json(updated);
  });

  router.get("/agents/:id/runtime-state", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, agent.companyId, "agents:admin");

    const state = await heartbeat.getRuntimeState(id);
    res.json(state);
  });

  router.get("/agents/:id/task-sessions", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, agent.companyId, "agents:admin");

    const sessions = await heartbeat.listTaskSessions(id);
    res.json(
      sessions.map((session) => ({
        ...session,
        sessionParamsJson: redactEventPayload(session.sessionParamsJson ?? null),
      })),
    );
  });

  router.post("/agents/:id/runtime-state/reset-session", validate(resetAgentSessionSchema), async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, agent.companyId, "agents:admin");

    const taskKey =
      typeof req.body.taskKey === "string" && req.body.taskKey.trim().length > 0
        ? req.body.taskKey.trim()
        : null;
    const state = await heartbeat.resetRuntimeSession(id, { taskKey });

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.runtime_session_reset",
      entityType: "agent",
      entityId: id,
      details: { taskKey: taskKey ?? null },
    });

    res.json(state);
  });

  router.post("/companies/:companyId/agent-hires", validate(createAgentHireSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCanCreateAgentsForCompany(req, companyId);
    const sourceIssueIds = parseSourceIssueIds(req.body);
    const { sourceIssueId: _sourceIssueId, sourceIssueIds: _sourceIssueIds, ...hireInput } = req.body;
    await assertAdapterAllowed(companyId, req, hireInput.adapterType);
    const requestedAdapterConfig = stripCwdIfNotAdmin(
      applyCreateDefaultsByAdapterType(
        hireInput.adapterType,
        ((hireInput.adapterConfig ?? {}) as Record<string, unknown>),
      ),
      req,
    );
    let normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      requestedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    normalizedAdapterConfig = stripLocalAdapterApiKeys(hireInput.adapterType, normalizedAdapterConfig) as typeof normalizedAdapterConfig;
    await assertAdapterConfigConstraints(
      companyId,
      hireInput.adapterType,
      normalizedAdapterConfig,
    );
    assertNonAdminApiKeyRequired(hireInput.adapterType, normalizedAdapterConfig, req);
    const normalizedHireInput = {
      ...hireInput,
      adapterConfig: normalizedAdapterConfig,
    };

    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const requiresApproval = company.requireBoardApprovalForNewAgents;
    const status = requiresApproval ? "pending_approval" : "idle";
    const agent = await svc.create(companyId, {
      ...normalizedHireInput,
      status,
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });

    let approval: Awaited<ReturnType<typeof approvalsSvc.getById>> | null = null;
    const actor = getActorInfo(req);

    if (requiresApproval) {
      const requestedAdapterType = normalizedHireInput.adapterType ?? agent.adapterType;
      const requestedAdapterConfig =
        redactEventPayload(
          (normalizedHireInput.adapterConfig ?? agent.adapterConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedRuntimeConfig =
        redactEventPayload(
          (normalizedHireInput.runtimeConfig ?? agent.runtimeConfig) as Record<string, unknown>,
        ) ?? {};
      const requestedMetadata =
        redactEventPayload(
          ((normalizedHireInput.metadata ?? agent.metadata ?? {}) as Record<string, unknown>),
        ) ?? {};
      approval = await approvalsSvc.create(companyId, {
        type: "hire_agent",
        requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
        requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
        status: "pending",
        payload: {
          name: normalizedHireInput.name,
          role: normalizedHireInput.role,
          title: normalizedHireInput.title ?? null,
          icon: normalizedHireInput.icon ?? null,
          reportsTo: normalizedHireInput.reportsTo ?? null,
          capabilities: normalizedHireInput.capabilities ?? null,
          adapterType: requestedAdapterType,
          adapterConfig: requestedAdapterConfig,
          runtimeConfig: requestedRuntimeConfig,
          budgetMonthlyCents:
            typeof normalizedHireInput.budgetMonthlyCents === "number"
              ? normalizedHireInput.budgetMonthlyCents
              : agent.budgetMonthlyCents,
          metadata: requestedMetadata,
          agentId: agent.id,
          requestedByAgentId: actor.actorType === "agent" ? actor.actorId : null,
          requestedConfigurationSnapshot: {
            adapterType: requestedAdapterType,
            adapterConfig: requestedAdapterConfig,
            runtimeConfig: requestedRuntimeConfig,
          },
        },
        decisionNote: null,
        decidedByUserId: null,
        decidedAt: null,
        decisionSource: "human",
        policyId: null,
        policySnapshot: null,
        updatedAt: new Date(),
      });

      if (sourceIssueIds.length > 0) {
        await issueApprovalsSvc.linkManyForApproval(approval.id, sourceIssueIds, {
          agentId: actor.actorType === "agent" ? actor.actorId : null,
          userId: actor.actorType === "user" ? actor.actorId : null,
        });
      }
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.hire_created",
      entityType: "agent",
      entityId: agent.id,
      details: {
        name: agent.name,
        role: agent.role,
        requiresApproval,
        approvalId: approval?.id ?? null,
        issueIds: sourceIssueIds,
      },
    });

    if (approval) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "approval.created",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type, linkedAgentId: agent.id },
      });

      scheduleCompanyNotificationEvent(db, companyId, "approval.created", {
        approvalId: approval.id,
        type: approval.type,
        status: approval.status,
        linkedAgentId: agent.id,
      });

      const hirePolicy = await hireApprovalPolicies.getForCompany(companyId, "hire_agent");
      const budgetForPolicy =
        typeof normalizedHireInput.budgetMonthlyCents === "number"
          ? normalizedHireInput.budgetMonthlyCents
          : Number(agent.budgetMonthlyCents ?? 0);
      const policyMatch = hireApprovalPolicies.evaluateHireBudget(hirePolicy, budgetForPolicy);
      if (policyMatch) {
        const resolved = await approvalsSvc.approve(
          approval.id,
          null,
          "Auto-approved by company hire policy",
          {
            decisionSource: "policy",
            policyId: policyMatch.policy.id,
            policySnapshot: policyMatch.snapshot,
          },
        );
        if (resolved.applied) {
          await runApprovalApprovedFollowUp(db, resolved.approval, { userId: null, label: "policy" });
          approval = resolved.approval;
        }
      }
    }

    res.status(201).json({ agent, approval });
  });

  function stripCwdIfNotAdmin(adapterConfig: Record<string, unknown>, req: Request): Record<string, unknown> {
    if (hasCompanyViewAll(req)) return adapterConfig;
    if (!Object.prototype.hasOwnProperty.call(adapterConfig, "cwd")) return adapterConfig;
    const { cwd: _cwd, ...rest } = adapterConfig;
    return rest;
  }

  router.post("/companies/:companyId/agents", validate(createAgentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);

    if (req.actor.type === "agent") {
      assertBoard(req);
    } else {
      await assertCompanyPermission(db, req, companyId, "agents:create");
    }

    await assertAdapterAllowed(companyId, req, req.body.adapterType);
    const requestedAdapterConfig = stripCwdIfNotAdmin(
      applyCreateDefaultsByAdapterType(
        req.body.adapterType,
        ((req.body.adapterConfig ?? {}) as Record<string, unknown>),
      ),
      req,
    );
    let finalAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      companyId,
      requestedAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    finalAdapterConfig = stripLocalAdapterApiKeys(req.body.adapterType, finalAdapterConfig) as typeof finalAdapterConfig;
    if (!hasCompanyViewAll(req) && !finalAdapterConfig.cwd) {
      const defaultPath = await instanceSettingsService(db).getDefaultCompanyPath();
      const company = await companyService(db).getById(companyId);
      const effectiveCwd =
        company?.workingDirectory?.trim() ||
        (defaultPath ? path.join(defaultPath, companyId) : undefined);
      if (effectiveCwd) {
        finalAdapterConfig = { ...finalAdapterConfig, cwd: effectiveCwd };
      }
    }
    await assertAdapterConfigConstraints(
      companyId,
      req.body.adapterType,
      finalAdapterConfig,
    );
    assertNonAdminApiKeyRequired(req.body.adapterType, finalAdapterConfig, req);

    const agent = await svc.create(companyId, {
      ...req.body,
      adapterConfig: finalAdapterConfig,
      status: "idle",
      spentMonthlyCents: 0,
      lastHeartbeatAt: null,
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.created",
      entityType: "agent",
      entityId: agent.id,
      details: { name: agent.name, role: agent.role },
    });

    res.status(201).json(agent);
  });

  router.patch("/agents/:id/permissions", validate(updateAgentPermissionsSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);

    if (req.actor.type === "agent") {
      const actorAgent = req.actor.agentId ? await svc.getById(req.actor.agentId) : null;
      if (!actorAgent || actorAgent.companyId !== existing.companyId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      if (actorAgent.role !== "ceo") {
        res.status(403).json({ error: "Only CEO can manage permissions" });
        return;
      }
    }

    const { canCreateAgents, canManageProjects } = req.body;

    if (canCreateAgents !== undefined) {
      const afterCreate = await svc.updatePermissions(id, { canCreateAgents });
      if (!afterCreate) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
    }

    if (canManageProjects !== undefined) {
      const current = await svc.getById(id);
      if (!current) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      const grants = await access.listPrincipalGrants(current.companyId, "agent", id);
      const without = grants.filter((g) => g.permissionKey !== "projects:manage");
      const nextGrants = canManageProjects
        ? [...without, { permissionKey: "projects:manage" as const }]
        : without;
      const grantedByUserId = req.actor.type === "board" ? req.actor.userId ?? null : null;
      await access.setPrincipalGrants(current.companyId, "agent", id, nextGrants, grantedByUserId);
    }

    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.permissions_updated",
      entityType: "agent",
      entityId: agent.id,
      details: req.body,
    });

    res.json(await withPrincipalPermissionFields(req, agent));
  });

  router.patch("/agents/:id/instructions-path", validate(updateAgentInstructionsPathSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await assertCanManageInstructionsPath(req, existing);

    const existingAdapterConfig = asRecord(existing.adapterConfig) ?? {};
    const explicitKey = asNonEmptyString(req.body.adapterConfigKey);
    const defaultKey = DEFAULT_INSTRUCTIONS_PATH_KEYS[existing.adapterType] ?? null;
    const adapterConfigKey = explicitKey ?? defaultKey;
    if (!adapterConfigKey) {
      res.status(422).json({
        error: `No default instructions path key for adapter type '${existing.adapterType}'. Provide adapterConfigKey.`,
      });
      return;
    }

    const nextAdapterConfig: Record<string, unknown> = { ...existingAdapterConfig };
    if (req.body.path === null) {
      delete nextAdapterConfig[adapterConfigKey];
    } else {
      nextAdapterConfig[adapterConfigKey] = resolveInstructionsFilePath(req.body.path, existingAdapterConfig);
    }

    let normalizedAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
      existing.companyId,
      nextAdapterConfig,
      { strictMode: strictSecretsMode },
    );
    normalizedAdapterConfig = stripLocalAdapterApiKeys(existing.adapterType, normalizedAdapterConfig) as typeof normalizedAdapterConfig;
    const actor = getActorInfo(req);
    const agent = await svc.update(
      id,
      { adapterConfig: normalizedAdapterConfig },
      {
        recordRevision: {
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
          source: "instructions_path_patch",
        },
      },
    );
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const updatedAdapterConfig = asRecord(agent.adapterConfig) ?? {};
    const pathValue = asNonEmptyString(updatedAdapterConfig[adapterConfigKey]);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.instructions_path_updated",
      entityType: "agent",
      entityId: agent.id,
      details: {
        adapterConfigKey,
        path: pathValue,
        cleared: req.body.path === null,
      },
    });

    res.json({
      agentId: agent.id,
      adapterType: agent.adapterType,
      adapterConfigKey,
      path: pathValue,
    });
  });

  router.patch("/agents/:id", validate(updateAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCanUpdateAgent(req, existing);

    if (Object.prototype.hasOwnProperty.call(req.body, "permissions")) {
      res.status(422).json({ error: "Use /api/agents/:id/permissions for permission changes" });
      return;
    }

    const patchData = { ...(req.body as Record<string, unknown>) };
    if (Object.prototype.hasOwnProperty.call(patchData, "adapterConfig")) {
      let adapterConfig = asRecord(patchData.adapterConfig);
      if (!adapterConfig) {
        res.status(422).json({ error: "adapterConfig must be an object" });
        return;
      }
      if (!hasCompanyViewAll(req) && Object.prototype.hasOwnProperty.call(adapterConfig, "cwd")) {
        const existingCwd = (asRecord(existing.adapterConfig) ?? {})?.cwd;
        adapterConfig = { ...adapterConfig, cwd: existingCwd };
      }
      const changingInstructionsPath = Object.keys(adapterConfig).some((key) =>
        KNOWN_INSTRUCTIONS_PATH_KEYS.has(key),
      );
      if (changingInstructionsPath) {
        await assertCanManageInstructionsPath(req, existing);
      }
      patchData.adapterConfig = adapterConfig;
    }

    const requestedAdapterType =
      typeof patchData.adapterType === "string" ? patchData.adapterType : existing.adapterType;
    const touchesAdapterConfiguration =
      Object.prototype.hasOwnProperty.call(patchData, "adapterType") ||
      Object.prototype.hasOwnProperty.call(patchData, "adapterConfig");
    if (touchesAdapterConfiguration) {
      await assertAdapterAllowed(existing.companyId, req, requestedAdapterType);
      const rawEffectiveAdapterConfig = Object.prototype.hasOwnProperty.call(patchData, "adapterConfig")
        ? (asRecord(patchData.adapterConfig) ?? {})
        : (asRecord(existing.adapterConfig) ?? {});
      const effectiveAdapterConfig = applyCreateDefaultsByAdapterType(
        requestedAdapterType,
        rawEffectiveAdapterConfig,
      );
      let normalizedEffectiveAdapterConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        existing.companyId,
        effectiveAdapterConfig,
        { strictMode: strictSecretsMode },
      );
      normalizedEffectiveAdapterConfig = stripLocalAdapterApiKeys(
        requestedAdapterType,
        normalizedEffectiveAdapterConfig,
      ) as typeof normalizedEffectiveAdapterConfig;
      assertNonAdminApiKeyRequired(requestedAdapterType, normalizedEffectiveAdapterConfig, req);
      patchData.adapterConfig = normalizedEffectiveAdapterConfig;
    }
    if (touchesAdapterConfiguration && requestedAdapterType === "opencode_local") {
      const effectiveAdapterConfig = asRecord(patchData.adapterConfig) ?? {};
      await assertAdapterConfigConstraints(
        existing.companyId,
        requestedAdapterType,
        effectiveAdapterConfig,
      );
    }

    const actor = getActorInfo(req);
    const agent = await svc.update(id, patchData, {
      recordRevision: {
        createdByAgentId: actor.agentId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        source: "patch",
      },
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent.updated",
      entityType: "agent",
      entityId: agent.id,
      details: summarizeAgentUpdateDetails(patchData),
    });

    res.json(agent);
  });

  router.post("/agents/:id/pause", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const agent = await svc.pause(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.paused",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/resume", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const agent = await svc.resume(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.resumed",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.post("/agents/:id/terminate", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const agent = await svc.terminate(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await heartbeat.cancelActiveForAgent(id);

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.terminated",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json(agent);
  });

  router.delete("/agents/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const agent = await svc.remove(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    await logActivity(db, {
      companyId: agent.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "agent.deleted",
      entityType: "agent",
      entityId: agent.id,
    });

    res.json({ ok: true });
  });

  router.get("/agents/:id/keys", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, agent.companyId, "agents:admin");
    const keys = await svc.listKeys(id);
    res.json(keys);
  });

  router.post("/agents/:id/keys", validate(createAgentKeySchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const key = await svc.createApiKey(id, req.body.name);

    const agent = await svc.getById(id);
    if (agent) {
      await logActivity(db, {
        companyId: agent.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "agent.key_created",
        entityType: "agent",
        entityId: agent.id,
        details: { keyId: key.id, name: key.name },
      });
    }

    res.status(201).json(key);
  });

  router.delete("/agents/:id/keys/:keyId", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, existing.companyId, "agents:admin");
    const keyId = req.params.keyId as string;
    const revoked = await svc.revokeKey(keyId);
    if (!revoked) {
      res.status(404).json({ error: "Key not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/agents/:id/wakeup", validate(wakeAgentSchema), async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyAccess(req, agent.companyId, db);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.wakeup(id, {
      source: req.body.source,
      triggerDetail: req.body.triggerDetail ?? "manual",
      reason: req.body.reason ?? null,
      payload: req.body.payload ?? null,
      idempotencyKey: req.body.idempotencyKey ?? null,
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      contextSnapshot: {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
      },
    });

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/heartbeat/invoke", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyAccess(req, agent.companyId, db);

    if (req.actor.type === "agent" && req.actor.agentId !== id) {
      res.status(403).json({ error: "Agent can only invoke itself" });
      return;
    }

    const run = await heartbeat.invoke(
      id,
      "on_demand",
      {
        triggeredBy: req.actor.type,
        actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
      },
      "manual",
      {
        actorType: req.actor.type === "agent" ? "agent" : "user",
        actorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
      },
    );

    if (!run) {
      res.status(202).json({ status: "skipped" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: agent.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "heartbeat.invoked",
      entityType: "heartbeat_run",
      entityId: run.id,
      details: { agentId: id },
    });

    res.status(202).json(run);
  });

  router.post("/agents/:id/claude-login", async (req, res) => {
    const id = req.params.id as string;
    const agent = await svc.getById(id);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    await assertCompanyPermission(db, req, agent.companyId, "agents:admin");
    if (agent.adapterType !== "claude_local") {
      res.status(400).json({ error: "Login is only supported for claude_local agents" });
      return;
    }

    const config = asRecord(agent.adapterConfig) ?? {};
    const { config: runtimeConfig } = await secretsSvc.resolveAdapterConfigForRuntime(agent.companyId, config);
    const result = await runClaudeLogin({
      runId: `claude-login-${randomUUID()}`,
      agent: {
        id: agent.id,
        companyId: agent.companyId,
        name: agent.name,
        adapterType: agent.adapterType,
        adapterConfig: agent.adapterConfig,
      },
      config: runtimeConfig,
    });

    res.json(result);
  });

  router.get("/companies/:companyId/heartbeat-runs/quality-summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const parsed = heartbeatRunsQualityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { from, to } = parsed.data;
    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: "from must be <= to" });
      return;
    }
    const rq = runQualityService(db);
    const summary = await rq.qualitySummary(companyId, from, to);
    res.json(summary);
  });

  router.get("/companies/:companyId/heartbeat-runs/error-clusters", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const parsed = heartbeatRunsQualityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { from, to } = parsed.data;
    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: "from must be <= to" });
      return;
    }
    const rq = runQualityService(db);
    const clusters = await rq.errorClusters(companyId, from, to);
    res.json(clusters);
  });

  router.get("/companies/:companyId/heartbeat-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");
    const parsed = heartbeatRunsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const q = parsed.data;
    const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
    const rawInv = typeof req.query.invocationSource === "string" ? req.query.invocationSource : undefined;
    const statuses = parseHeartbeatRunsListStatuses(rawStatus);
    const invocationSources = parseHeartbeatRunsListInvocationSources(rawInv);
    if (rawStatus && !statuses) {
      res.status(400).json({ error: "Invalid status filter" });
      return;
    }
    if (rawInv && !invocationSources) {
      res.status(400).json({ error: "Invalid invocationSource filter" });
      return;
    }
    let cursorCreatedAt: Date | undefined;
    let cursorId: string | undefined;
    if (q.cursor) {
      const c = decodeHeartbeatRunCursor(q.cursor);
      if (!c) {
        res.status(400).json({ error: "Invalid cursor" });
        return;
      }
      cursorCreatedAt = c.createdAt;
      cursorId = c.id;
    }
    const runs = await heartbeat.list(companyId, {
      agentId: q.agentId,
      limit: q.limit,
      startedAfter: q.startedAfter,
      endedBefore: q.endedBefore,
      statuses,
      invocationSources,
      cursorCreatedAt,
      cursorId,
    });
    res.json(runs);
  });

  router.get("/companies/:companyId/live-runs", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "agents:read");

    const minCountParam = req.query.minCount as string | undefined;
    const minCount = minCountParam ? Math.max(0, Math.min(20, parseInt(minCountParam, 10) || 0)) : 0;

    const columns = {
      id: heartbeatRuns.id,
      status: heartbeatRuns.status,
      invocationSource: heartbeatRuns.invocationSource,
      triggerDetail: heartbeatRuns.triggerDetail,
      startedAt: heartbeatRuns.startedAt,
      finishedAt: heartbeatRuns.finishedAt,
      createdAt: heartbeatRuns.createdAt,
      agentId: heartbeatRuns.agentId,
      agentName: agentsTable.name,
      adapterType: agentsTable.adapterType,
      issueId: sql<string | null>`${heartbeatRuns.contextSnapshot} ->> 'issueId'`.as("issueId"),
    };

    // 排除聊天觸發的 run，不顯示在側邊欄「工作中」
    const liveRuns = await db
      .select(columns)
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
          sql`((${heartbeatRuns.contextSnapshot} ->> 'taskKey') is null or (${heartbeatRuns.contextSnapshot} ->> 'taskKey') not like 'chat:%')`,
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    if (minCount > 0 && liveRuns.length < minCount) {
      const activeIds = liveRuns.map((r) => r.id);
      const recentRuns = await db
        .select(columns)
        .from(heartbeatRuns)
        .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            not(inArray(heartbeatRuns.status, ["queued", "running"])),
            ...(activeIds.length > 0 ? [not(inArray(heartbeatRuns.id, activeIds))] : []),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(minCount - liveRuns.length);

      res.json([...liveRuns, ...recentRuns]);
      return;
    }

    res.json(liveRuns);
  });

  router.get("/heartbeat-runs/:runId", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, run.companyId, "agents:read");
    res.json(redactCurrentUserValue(run));
  });

  router.post("/heartbeat-runs/:runId/cancel", async (req, res) => {
    const runId = req.params.runId as string;
    const existingRun = await heartbeat.getRun(runId);
    if (!existingRun) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    await assertCompanyPermission(db, req, existingRun.companyId, "agents:admin");
    const run = await heartbeat.cancelRun(runId);

    if (run) {
      await logActivity(db, {
        companyId: run.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "heartbeat.cancelled",
        entityType: "heartbeat_run",
        entityId: run.id,
        details: { agentId: run.agentId },
      });
    }

    res.json(run);
  });

  router.post("/heartbeat-runs/:runId/retry-wake", async (req, res) => {
    const runId = req.params.runId as string;
    const existingRun = await heartbeat.getRun(runId);
    if (!existingRun) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    await assertCompanyPermission(db, req, existingRun.companyId, "agents:admin");
    const newRun = await heartbeat.retryWakeFromRun(runId);
    await logActivity(db, {
      companyId: existingRun.companyId,
      actorType: "user",
      actorId: req.actor.userId ?? "board",
      action: "heartbeat.retry_wake",
      entityType: "heartbeat_run",
      entityId: existingRun.id,
      details: { agentId: existingRun.agentId, newRunId: newRun?.id ?? null },
    });
    res.json({ runId: newRun?.id ?? null });
  });

  router.get("/heartbeat-runs/:runId/events", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, run.companyId, "agents:read");

    const afterSeq = Number(req.query.afterSeq ?? 0);
    const limit = Number(req.query.limit ?? 200);
    const events = await heartbeat.listEvents(runId, Number.isFinite(afterSeq) ? afterSeq : 0, Number.isFinite(limit) ? limit : 200);
    const redactedEvents = events.map((event) =>
      redactCurrentUserValue({
        ...event,
        payload: redactEventPayload(event.payload),
      }),
    );
    res.json(redactedEvents);
  });

  router.get("/heartbeat-runs/:runId/log", async (req, res) => {
    const runId = req.params.runId as string;
    const run = await heartbeat.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Heartbeat run not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, run.companyId, "agents:read");

    const offset = Number(req.query.offset ?? 0);
    const limitBytes = Number(req.query.limitBytes ?? 256000);
    const result = await heartbeat.readLog(runId, {
      offset: Number.isFinite(offset) ? offset : 0,
      limitBytes: Number.isFinite(limitBytes) ? limitBytes : 256000,
    });

    res.json(result);
  });

  router.get("/issues/:issueId/live-runs", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const isIdentifier = /^[A-Z]+-\d+$/i.test(rawId);
    const issue = isIdentifier ? await issueSvc.getByIdentifier(rawId) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "agents:read");

    const liveRuns = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        invocationSource: heartbeatRuns.invocationSource,
        triggerDetail: heartbeatRuns.triggerDetail,
        startedAt: heartbeatRuns.startedAt,
        finishedAt: heartbeatRuns.finishedAt,
        createdAt: heartbeatRuns.createdAt,
        agentId: heartbeatRuns.agentId,
        agentName: agentsTable.name,
        adapterType: agentsTable.adapterType,
      })
      .from(heartbeatRuns)
      .innerJoin(agentsTable, eq(heartbeatRuns.agentId, agentsTable.id))
      .where(
        and(
          eq(heartbeatRuns.companyId, issue.companyId),
          inArray(heartbeatRuns.status, ["queued", "running"]),
          sql`${heartbeatRuns.contextSnapshot} ->> 'issueId' = ${issue.id}`,
        ),
      )
      .orderBy(desc(heartbeatRuns.createdAt));

    res.json(liveRuns);
  });

  router.get("/issues/:issueId/active-run", async (req, res) => {
    const rawId = req.params.issueId as string;
    const issueSvc = issueService(db);
    const isIdentifier = /^[A-Z]+-\d+$/i.test(rawId);
    const issue = isIdentifier ? await issueSvc.getByIdentifier(rawId) : await issueSvc.getById(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");

    let run = issue.executionRunId ? await heartbeat.getRun(issue.executionRunId) : null;
    if (run && run.status !== "queued" && run.status !== "running") {
      run = null;
    }

    if (!run && issue.assigneeAgentId && issue.status === "in_progress") {
      const candidateRun = await heartbeat.getActiveRunForAgent(issue.assigneeAgentId);
      const candidateContext = asRecord(candidateRun?.contextSnapshot);
      const candidateIssueId = asNonEmptyString(candidateContext?.issueId);
      if (candidateRun && candidateIssueId === issue.id) {
        run = candidateRun;
      }
    }
    if (!run) {
      res.json(null);
      return;
    }

    const agent = await svc.getById(run.agentId);
    if (!agent) {
      res.json(null);
      return;
    }

    res.json({
      ...redactCurrentUserValue(run),
      agentId: agent.id,
      agentName: agent.name,
      adapterType: agent.adapterType,
    });
  });

  return router;
}
