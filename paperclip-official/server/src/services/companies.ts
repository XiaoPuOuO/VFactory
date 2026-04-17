import path from "node:path";
import fs from "node:fs/promises";
import { eq, count, and, notInArray, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { normalizeWorkingDirectory } from "@paperclipai/shared";
import { conflict, badRequest } from "../errors.js";
import {
  companies,
  companySubscriptions,
  plans,
  agents,
  agentApiKeys,
  agentConfigRevisions,
  agentRuntimeState,
  agentTaskSessions,
  agentWakeupRequests,
  agentSchedules,
  issues,
  issueComments,
  issueLabels,
  issueReadStates,
  issueAttachments,
  issueApprovals,
  projects,
  projectWorkspaces,
  projectGoals,
  goals,
  labels,
  assets,
  heartbeatRuns,
  heartbeatRunEvents,
  costEvents,
  limitBreachEvents,
  approvalComments,
  approvals,
  activityLog,
  companySecrets,
  joinRequests,
  invites,
  principalPermissionGrants,
  companyMemberships,
  chatRooms,
  workspaceRuntimeServices,
} from "@paperclipai/db";

export function companyService(db: Db) {
  const ISSUE_PREFIX_FALLBACK = "CMP";

  function deriveIssuePrefixBase(name: string) {
    const normalized = name.toUpperCase().replace(/[^A-Z]/g, "");
    return normalized.slice(0, 3) || ISSUE_PREFIX_FALLBACK;
  }

  function suffixForAttempt(attempt: number) {
    if (attempt <= 1) return "";
    return "A".repeat(attempt - 1);
  }

  function isIssuePrefixConflict(error: unknown) {
    const constraint = typeof error === "object" && error !== null && "constraint" in error
      ? (error as { constraint?: string }).constraint
      : typeof error === "object" && error !== null && "constraint_name" in error
        ? (error as { constraint_name?: string }).constraint_name
        : undefined;
    return typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: string }).code === "23505"
      && (constraint === "companies_tenant_issue_prefix_idx" || constraint === "companies_issue_prefix_idx");
  }

  async function createCompanyWithUniquePrefix(data: typeof companies.$inferInsert) {
    const normalizedWd = normalizeWorkingDirectory(
      data.workingDirectory as string | null | undefined,
    );
    const insertData = { ...data, workingDirectory: normalizedWd ?? undefined };
    const base = deriveIssuePrefixBase(data.name);
    let suffix = 1;
    while (suffix < 10000) {
      const candidate = `${base}${suffixForAttempt(suffix)}`;
      try {
        const rows = await db
          .insert(companies)
          .values({ ...insertData, issuePrefix: candidate })
          .returning();
        return rows[0];
      } catch (error) {
        if (!isIssuePrefixConflict(error)) throw error;
      }
      suffix += 1;
    }
    throw new Error("Unable to allocate unique issue prefix");
  }

  async function enrichCompanyWithIcon(
    row: typeof companies.$inferSelect | null,
  ): Promise<(typeof companies.$inferSelect & { iconContentPath?: string | null }) | null> {
    if (!row) return null;
    if (!row.iconAssetId) return { ...row, iconContentPath: null };
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, row.iconAssetId!), eq(assets.companyId, row.id)));
    return { ...row, iconContentPath: asset ? `/api/assets/${row.iconAssetId}/content` : null };
  }

  return {
    list: async (tenantId?: string) => {
      const query =
        tenantId != null
          ? db.select().from(companies).where(eq(companies.tenantId, tenantId))
          : db.select().from(companies);
      const rows = await query;
      if (rows.length === 0) return [];
      const withIcon = rows.filter((r) => r.iconAssetId);
      if (withIcon.length === 0) return rows.map((r) => ({ ...r, iconContentPath: null as string | null }));
      const iconIds = [...new Set(withIcon.map((r) => r.iconAssetId!))];
      const validAssets = await db
        .select({ id: assets.id, companyId: assets.companyId })
        .from(assets)
        .where(inArray(assets.id, iconIds));
      const validSet = new Set(validAssets.map((a) => `${a.companyId}:${a.id}`));
      return rows.map((r) => ({
        ...r,
        iconContentPath:
          r.iconAssetId && validSet.has(`${r.id}:${r.iconAssetId}`)
            ? `/api/assets/${r.iconAssetId}/content`
            : null,
      }));
    },

    getById: (id: string) =>
      db
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .then((rows) => rows[0] ?? null)
        .then(enrichCompanyWithIcon),

    create: async (data: typeof companies.$inferInsert) => createCompanyWithUniquePrefix(data),

    update: async (
      id: string,
      data: Partial<typeof companies.$inferInsert> & { moveWorkingDirectory?: boolean },
    ) => {
      const updatePayload: Partial<typeof companies.$inferInsert> & { moveWorkingDirectory?: boolean } = {
        ...data,
        updatedAt: new Date(),
      };

      let normalizedNew: string | null = null;
      if (Object.prototype.hasOwnProperty.call(data, "workingDirectory")) {
        normalizedNew = normalizeWorkingDirectory(
          data.workingDirectory as string | null | undefined,
        );
        updatePayload.workingDirectory = normalizedNew ?? undefined;
      }

      // 僅在用戶明確選擇「搬移」時（moveWorkingDirectory === true）才將舊目錄內容搬移到新路徑。
      // 若舊路徑下有 agents 子目錄，只搬移該子目錄到新路徑下（newPath/agents），foldera、folderb 等不動。
      const AGENTS_SUBFOLDER = "agents";
      const shouldMove = data.moveWorkingDirectory === true;
      if (
        shouldMove &&
        Object.prototype.hasOwnProperty.call(data, "workingDirectory") &&
        normalizedNew != null &&
        normalizedNew !== ""
      ) {
        const existing = await db
          .select({ workingDirectory: companies.workingDirectory })
          .from(companies)
          .where(eq(companies.id, id))
          .then((rows) => rows[0] ?? null);
        const oldCwd = existing?.workingDirectory?.trim() ?? null;
        if (oldCwd != null && oldCwd !== "") {
          const oldPath = path.resolve(oldCwd);
          const newPath = path.resolve(normalizedNew!);
          if (newPath.startsWith(oldPath + path.sep)) {
            throw badRequest("新設定目錄不可位於舊設定目錄之下，請先指定其他路徑。");
          }
          const statOld = await fs.stat(oldPath).catch(() => null);
          if (!statOld?.isDirectory()) {
            // 舊路徑不存在或非目錄，只更新 DB 路徑，不搬移
          } else {
            const agentsUnderOld = path.join(oldPath, AGENTS_SUBFOLDER);
            const statAgents = await fs.stat(agentsUnderOld).catch(() => null);
            const onlyMoveAgents = statAgents?.isDirectory() === true;

            if (onlyMoveAgents) {
              // 只搬 oldPath/agents → newPath/agents，不動 foldera、folderb 等
              await fs.mkdir(newPath, { recursive: true });
              const targetAgents = path.join(newPath, AGENTS_SUBFOLDER);
              const statTarget = await fs.stat(targetAgents).catch(() => null);
              if (statTarget != null) {
                if (!statTarget.isDirectory()) {
                  throw badRequest("新路徑下已存在同名檔案，無法建立 agents 目錄。");
                }
                const entries = await fs.readdir(targetAgents);
                if (entries.length > 0) {
                  throw badRequest(
                    "新路徑下的 agents 目錄已存在且非空，無法搬移。請選擇空目錄或先備份後清空再試。",
                  );
                }
              }
              await fs.cp(agentsUnderOld, targetAgents, { recursive: true, force: false });
              await fs.rm(agentsUnderOld, { recursive: true, force: true });
              // 儲存後 DB 的 working_directory 改為新路徑下的 agents
              updatePayload.workingDirectory = normalizeWorkingDirectory(
                path.join(newPath, AGENTS_SUBFOLDER),
              ) ?? undefined;
            } else {
              // 無 agents 子目錄：維持原行為，整顆目錄搬過去
              if (oldPath !== newPath) {
                const statNew = await fs.stat(newPath).catch(() => null);
                if (statNew != null) {
                  if (!statNew.isDirectory()) {
                    throw badRequest("新路徑已存在且為檔案，請指定目錄路徑。");
                  }
                  const entries = await fs.readdir(newPath);
                  if (entries.length > 0) {
                    throw badRequest(
                      "新設定目錄已存在且非空，無法搬移。請選擇空目錄或先備份後清空再試。",
                    );
                  }
                }
                await fs.cp(oldPath, newPath, { recursive: true, force: false });
                await fs.rm(oldPath, { recursive: true, force: true });
              }
            }
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(data, "iconAssetId") && data.iconAssetId != null) {
        const [asset] = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, data.iconAssetId), eq(assets.companyId, id)));
        if (!asset) {
          throw badRequest("iconAssetId 必須為本公司之 asset");
        }
      }

      const payloadForDb: Partial<typeof companies.$inferInsert> = { ...updatePayload };
      delete (payloadForDb as Record<string, unknown>).moveWorkingDirectory;

      const [updated] = await db
        .update(companies)
        .set(payloadForDb)
        .where(eq(companies.id, id))
        .returning();
      const company = updated ?? null;

      if (company != null && Object.prototype.hasOwnProperty.call(data, "workingDirectory")) {
        const newCwd = company.workingDirectory ?? null;
        const companyAgents = await db
          .select({ id: agents.id, adapterConfig: agents.adapterConfig })
          .from(agents)
          .where(eq(agents.companyId, id));
        for (const agent of companyAgents) {
          const config = (agent.adapterConfig as Record<string, unknown>) ?? {};
          const nextConfig = { ...config, cwd: newCwd ?? undefined };
          if (newCwd == null && config.cwd === undefined) continue;
          await db
            .update(agents)
            .set({
              adapterConfig: nextConfig,
              updatedAt: new Date(),
            })
            .where(eq(agents.id, agent.id));
        }
      }

      return enrichCompanyWithIcon(company);
    },

    archive: (id: string) =>
      db
        .update(companies)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(companies.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    /** 在既有 transaction 內刪除公司及其所有關聯資料（供 deleteUser 等呼叫） */
    async removeWithinTransaction(
      tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
      id: string,
    ): Promise<void> {
      await tx.delete(activityLog).where(eq(activityLog.companyId, id));
      await tx.delete(heartbeatRunEvents).where(eq(heartbeatRunEvents.companyId, id));
      await tx.delete(agentTaskSessions).where(eq(agentTaskSessions.companyId, id));
      await tx.delete(heartbeatRuns).where(eq(heartbeatRuns.companyId, id));
      await tx.delete(agentWakeupRequests).where(eq(agentWakeupRequests.companyId, id));
      await tx.delete(agentSchedules).where(eq(agentSchedules.companyId, id));
      await tx.delete(agentApiKeys).where(eq(agentApiKeys.companyId, id));
      await tx.delete(agentRuntimeState).where(eq(agentRuntimeState.companyId, id));
      await tx.delete(issueApprovals).where(eq(issueApprovals.companyId, id));
      await tx.delete(issueComments).where(eq(issueComments.companyId, id));
      await tx.delete(issueLabels).where(eq(issueLabels.companyId, id));
      await tx.delete(issueReadStates).where(eq(issueReadStates.companyId, id));
      await tx.delete(issueAttachments).where(eq(issueAttachments.companyId, id));
      await tx.delete(labels).where(eq(labels.companyId, id));
      await tx.delete(issues).where(eq(issues.companyId, id));
      await tx.delete(assets).where(eq(assets.companyId, id));
      await tx.delete(costEvents).where(eq(costEvents.companyId, id));
      await tx.delete(limitBreachEvents).where(eq(limitBreachEvents.companyId, id));
      await tx.delete(approvalComments).where(eq(approvalComments.companyId, id));
      await tx.delete(approvals).where(eq(approvals.companyId, id));
      await tx.delete(companySecrets).where(eq(companySecrets.companyId, id));
      await tx.delete(joinRequests).where(eq(joinRequests.companyId, id));
      await tx.delete(invites).where(eq(invites.companyId, id));
      await tx.delete(principalPermissionGrants).where(eq(principalPermissionGrants.companyId, id));
      await tx.delete(companyMemberships).where(eq(companyMemberships.companyId, id));
      await tx.delete(goals).where(eq(goals.companyId, id));
      await tx.delete(projectWorkspaces).where(eq(projectWorkspaces.companyId, id));
      await tx.delete(projectGoals).where(eq(projectGoals.companyId, id));
      await tx.delete(projects).where(eq(projects.companyId, id));
      await tx.delete(chatRooms).where(eq(chatRooms.companyId, id));
      await tx.delete(agentConfigRevisions).where(eq(agentConfigRevisions.companyId, id));
      await tx.delete(workspaceRuntimeServices).where(eq(workspaceRuntimeServices.companyId, id));
      await tx.delete(agents).where(eq(agents.companyId, id));
      await tx.delete(companies).where(eq(companies.id, id));
    },

    remove: (id: string) =>
      db.transaction(async (tx) => {
        const [row] = await tx.select().from(companies).where(eq(companies.id, id)).limit(1);
        await companyService(db).removeWithinTransaction(tx, id);
        return row ?? null;
      }),

    stats: async (tenantId?: string) => {
      const companyRows =
        tenantId != null
          ? await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId))
          : await db.select({ id: companies.id }).from(companies);
      const companyIdSet = new Set(companyRows.map((r) => r.id));

      const [agentRows, issueRows, subRows] = await Promise.all([
        db
          .select({ companyId: agents.companyId, count: count() })
          .from(agents)
          .groupBy(agents.companyId),
        db
          .select({ companyId: issues.companyId, count: count() })
          .from(issues)
          .groupBy(issues.companyId),
        db
          .select({
            companyId: companySubscriptions.companyId,
            planId: companySubscriptions.planId,
            planSlug: plans.slug,
            planName: plans.name,
            currentPeriodEnd: companySubscriptions.currentPeriodEnd,
            paymentProvider: companySubscriptions.paymentProvider,
            status: companySubscriptions.status,
          })
          .from(companySubscriptions)
          .innerJoin(plans, eq(companySubscriptions.planId, plans.id)),
      ]);

      type SubSummary = {
        planId: string;
        planSlug: string;
        planName: string;
        currentPeriodEnd: string | null;
        paymentProvider: string;
        status: string;
      };

      const result: Record<
        string,
        { agentCount: number; issueCount: number; subscription: SubSummary | null }
      > = {};

      for (const id of companyIdSet) {
        result[id] = { agentCount: 0, issueCount: 0, subscription: null };
      }

      for (const row of agentRows) {
        if (!companyIdSet.has(row.companyId)) continue;
        const entry = result[row.companyId];
        if (entry) entry.agentCount = row.count;
      }
      for (const row of issueRows) {
        if (!companyIdSet.has(row.companyId)) continue;
        const entry = result[row.companyId];
        if (entry) entry.issueCount = row.count;
      }
      for (const row of subRows) {
        if (!companyIdSet.has(row.companyId)) continue;
        const entry = result[row.companyId];
        if (entry) {
          entry.subscription = {
            planId: row.planId,
            planSlug: row.planSlug,
            planName: row.planName,
            currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
            paymentProvider: row.paymentProvider,
            status: row.status,
          };
        }
      }

      return result;
    },

    /**
     * 刪除所有「孤兒」資料：company_id 指向已不存在之公司的列。
     * 刪除順序與 remove() 一致以符合 FK。僅供 instance admin 呼叫。
     */
    cleanupOrphans: async () => {
      const validRows = await db.select({ id: companies.id }).from(companies);
      const validIds = validRows.map((r) => r.id);
      if (validIds.length === 0) {
        return { ok: true };
      }
      await db.transaction(async (tx) => {
        await tx.delete(activityLog).where(notInArray(activityLog.companyId, validIds));
        await tx.delete(heartbeatRunEvents).where(notInArray(heartbeatRunEvents.companyId, validIds));
        await tx.delete(agentTaskSessions).where(notInArray(agentTaskSessions.companyId, validIds));
        await tx.delete(heartbeatRuns).where(notInArray(heartbeatRuns.companyId, validIds));
        await tx.delete(agentWakeupRequests).where(notInArray(agentWakeupRequests.companyId, validIds));
        await tx.delete(agentSchedules).where(notInArray(agentSchedules.companyId, validIds));
        await tx.delete(agentApiKeys).where(notInArray(agentApiKeys.companyId, validIds));
        await tx.delete(agentRuntimeState).where(notInArray(agentRuntimeState.companyId, validIds));
        await tx.delete(issueApprovals).where(notInArray(issueApprovals.companyId, validIds));
        await tx.delete(issueComments).where(notInArray(issueComments.companyId, validIds));
        await tx.delete(issueLabels).where(notInArray(issueLabels.companyId, validIds));
        await tx.delete(issueReadStates).where(notInArray(issueReadStates.companyId, validIds));
        await tx.delete(issueAttachments).where(notInArray(issueAttachments.companyId, validIds));
        await tx.delete(labels).where(notInArray(labels.companyId, validIds));
        await tx.delete(issues).where(notInArray(issues.companyId, validIds));
        await tx.delete(assets).where(notInArray(assets.companyId, validIds));
        await tx.delete(costEvents).where(notInArray(costEvents.companyId, validIds));
        await tx.delete(approvalComments).where(notInArray(approvalComments.companyId, validIds));
        await tx.delete(approvals).where(notInArray(approvals.companyId, validIds));
        await tx.delete(companySecrets).where(notInArray(companySecrets.companyId, validIds));
        await tx.delete(joinRequests).where(notInArray(joinRequests.companyId, validIds));
        await tx.delete(invites).where(notInArray(invites.companyId, validIds));
        await tx.delete(principalPermissionGrants).where(notInArray(principalPermissionGrants.companyId, validIds));
        await tx.delete(companyMemberships).where(notInArray(companyMemberships.companyId, validIds));
        await tx.delete(goals).where(notInArray(goals.companyId, validIds));
        await tx.delete(projectWorkspaces).where(notInArray(projectWorkspaces.companyId, validIds));
        await tx.delete(projectGoals).where(notInArray(projectGoals.companyId, validIds));
        await tx.delete(projects).where(notInArray(projects.companyId, validIds));
        await tx.delete(chatRooms).where(notInArray(chatRooms.companyId, validIds));
        await tx.delete(agentConfigRevisions).where(notInArray(agentConfigRevisions.companyId, validIds));
        await tx.delete(workspaceRuntimeServices).where(notInArray(workspaceRuntimeServices.companyId, validIds));
        await tx.delete(agents).where(notInArray(agents.companyId, validIds));
      });
      return { ok: true };
    },
  };
}
