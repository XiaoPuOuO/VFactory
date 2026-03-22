import { createHash } from "node:crypto";
import type { Request, RequestHandler } from "express";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentApiKeys,
  agents,
  authUsers,
  companies,
  companyMemberships,
  integrationApiKeys,
  instanceSettings,
  tenantMemberships,
} from "@paperclipai/db";
import { instanceGroupsService } from "../services/instance-groups.js";
import { verifyLocalAgentJwt } from "../agent-auth-jwt.js";
import type { DeploymentMode } from "@paperclipai/shared";
import type { BetterAuthSessionResult } from "../auth/better-auth.js";
import { logger } from "./logger.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 查詢使用者封禁狀態；傳入 undefined 時不檢查（如 local_trusted 模式） */
export type GetBanStatusFn = (
  userId: string,
) => Promise<{ banned: boolean; reason: string | null; bannedUntil: Date | null } | null>;

interface ActorMiddlewareOptions {
  deploymentMode: DeploymentMode;
  resolveSession?: (req: Request) => Promise<BetterAuthSessionResult | null>;
  getBanStatus?: GetBanStatusFn;
}

export function actorMiddleware(db: Db, opts: ActorMiddlewareOptions): RequestHandler {
  return async (req, _res, next) => {
    const requireSession = opts.deploymentMode === "authenticated";
    req.actor = { type: "none", source: "none" };

    const runIdHeader = req.header("x-paperclip-run-id");

    const authHeader = req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      if (requireSession && opts.resolveSession) {
        let session: BetterAuthSessionResult | null = null;
        try {
          session = await opts.resolveSession(req);
        } catch (err) {
          logger.warn(
            { err, method: req.method, url: req.originalUrl },
            "Failed to resolve auth session from request headers",
          );
        }
        if (session?.user?.id) {
          const userId = session.user.id;
          if (opts.getBanStatus) {
            const banStatus = await opts.getBanStatus(userId);
            if (banStatus?.banned) {
              req.actor = {
                type: "banned",
                userId,
                reason: banStatus.reason ?? "Account suspended",
                bannedUntil: banStatus.bannedUntil ?? null,
              };
              next();
              return;
            }
          }
          const [userRow, memberships, tenantMembership, defaultGroupRow] = await Promise.all([
            db
              .select({ group: authUsers.group })
              .from(authUsers)
              .where(eq(authUsers.id, userId))
              .then((rows) => rows[0] ?? null),
            db
              .select({ companyId: companyMemberships.companyId })
              .from(companyMemberships)
              .where(
                and(
                  eq(companyMemberships.principalType, "user"),
                  eq(companyMemberships.principalId, userId),
                  eq(companyMemberships.status, "active"),
                ),
              ),
            req.tenantId
              ? db
                  .select({ id: tenantMemberships.id })
                  .from(tenantMemberships)
                  .where(
                    and(
                      eq(tenantMemberships.tenantId, req.tenantId),
                      eq(tenantMemberships.userId, userId),
                    ),
                  )
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
            db
              .select({ value: instanceSettings.value })
              .from(instanceSettings)
              .where(eq(instanceSettings.key, "default_group"))
              .then((rows) => rows[0] ?? null),
          ]);
          const defaultGroupName =
            defaultGroupRow?.value != null && String(defaultGroupRow.value).trim() !== ""
              ? defaultGroupRow.value.trim()
              : "default";
          const groupForPermissions =
            userRow?.group != null && String(userRow.group).trim() !== ""
              ? userRow.group
              : defaultGroupName;
          const instanceGroupSvc = instanceGroupsService(db);
          const permissions = await instanceGroupSvc.getEffectivePermissionKeysByGroupName(groupForPermissions);
          let companyIds = memberships.map((row) => row.companyId);
          const hasInstanceGroup = permissions.length > 0;
          if (req.tenantId && !tenantMembership && !hasInstanceGroup) {
            companyIds = [];
          } else if (req.tenantId && (tenantMembership || hasInstanceGroup)) {
            const companiesInTenant = await db
              .select({ id: companies.id })
              .from(companies)
              .where(eq(companies.tenantId, req.tenantId));
            const tenantCompanyIds = new Set(companiesInTenant.map((c) => c.id));
            companyIds = companyIds.filter((id) => tenantCompanyIds.has(id));
          }
          req.actor = {
            type: "board",
            userId,
            companyIds,
            permissions: permissions.length > 0 ? permissions : undefined,
            runId: runIdHeader ?? undefined,
            source: "session",
          };
          next();
          return;
        }
      }
      if (runIdHeader) req.actor.runId = runIdHeader;
      next();
      return;
    }

    const token = authHeader.slice("bearer ".length).trim();
    if (!token) {
      next();
      return;
    }

    const tokenHash = hashToken(token);
    const key = await db
      .select()
      .from(agentApiKeys)
      .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
      .then((rows) => rows[0] ?? null);

    if (!key) {
      const intKey = await db
        .select()
        .from(integrationApiKeys)
        .where(and(eq(integrationApiKeys.keyHash, tokenHash), isNull(integrationApiKeys.revokedAt)))
        .then((rows) => rows[0] ?? null);

      if (intKey) {
        await db
          .update(integrationApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(integrationApiKeys.id, intKey.id));

        const companyRow = await db
          .select({ tenantId: companies.tenantId })
          .from(companies)
          .where(eq(companies.id, intKey.companyId))
          .then((rows) => rows[0] ?? null);
        if (!companyRow) {
          next();
          return;
        }
        if (req.tenantId && companyRow.tenantId !== req.tenantId) {
          next();
          return;
        }
        if (!req.tenantId) req.tenantId = companyRow.tenantId;

        const rawScopes = intKey.scopes;
        const integrationScopes = Array.isArray(rawScopes)
          ? rawScopes.filter((s): s is string => typeof s === "string")
          : [];

        req.actor = {
          type: "service",
          companyId: intKey.companyId,
          keyId: intKey.id,
          integrationScopes,
          source: "integration_key",
          runId: runIdHeader ?? undefined,
        };
        next();
        return;
      }

      const claims = verifyLocalAgentJwt(token);
      if (!claims) {
        next();
        return;
      }

      const agentRecord = await db
        .select()
        .from(agents)
        .where(eq(agents.id, claims.sub))
        .then((rows) => rows[0] ?? null);

      if (!agentRecord || agentRecord.companyId !== claims.company_id) {
        next();
        return;
      }

      if (agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
        next();
        return;
      }

      const companyRow = await db
        .select({ tenantId: companies.tenantId })
        .from(companies)
        .where(eq(companies.id, agentRecord.companyId))
        .then((rows) => rows[0] ?? null);
      if (!companyRow) {
        next();
        return;
      }
      if (req.tenantId && companyRow.tenantId !== req.tenantId) {
        next();
        return;
      }
      if (!req.tenantId) req.tenantId = companyRow.tenantId;

      req.actor = {
        type: "agent",
        agentId: claims.sub,
        companyId: claims.company_id,
        keyId: undefined,
        runId: runIdHeader || claims.run_id || undefined,
        source: "agent_jwt",
      };
      next();
      return;
    }

    await db
      .update(agentApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentApiKeys.id, key.id));

    const agentRecord = await db
      .select()
      .from(agents)
      .where(eq(agents.id, key.agentId))
      .then((rows) => rows[0] ?? null);

    if (!agentRecord || agentRecord.status === "terminated" || agentRecord.status === "pending_approval") {
      next();
      return;
    }

    const companyRow = await db
      .select({ tenantId: companies.tenantId })
      .from(companies)
      .where(eq(companies.id, agentRecord.companyId))
      .then((rows) => rows[0] ?? null);
    if (!companyRow) {
      next();
      return;
    }
    if (req.tenantId && companyRow.tenantId !== req.tenantId) {
      next();
      return;
    }
    if (!req.tenantId) req.tenantId = companyRow.tenantId;

    req.actor = {
      type: "agent",
      agentId: key.agentId,
      companyId: key.companyId,
      keyId: key.id,
      runId: runIdHeader || undefined,
      source: "agent_key",
    };

    next();
  };
}

export function requireBoard(req: Express.Request) {
  return req.actor.type === "board";
}
