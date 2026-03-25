import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  companies,
  companyMemberships,
  instanceGroupPermissions,
  instanceGroups,
} from "@paperclipai/db";
import type { DeploymentMode } from "@paperclipai/shared";

const LOCAL_BOARD_USER_ID = "local-board";
const ADMIN_GROUP_NAME = "admin";
const CLAIM_TTL_MS = 1000 * 60 * 60 * 24;

type ChallengeStatus = "available" | "claimed" | "expired" | "invalid";

type ClaimChallenge = {
  token: string;
  code: string;
  createdAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
  claimedByUserId: string | null;
};

let activeChallenge: ClaimChallenge | null = null;

function createChallenge(now = new Date()): ClaimChallenge {
  return {
    token: randomBytes(24).toString("hex"),
    code: randomBytes(12).toString("hex"),
    createdAt: now,
    expiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
    claimedAt: null,
    claimedByUserId: null,
  };
}

function getChallengeStatus(token: string, code: string | undefined): ChallengeStatus {
  if (!activeChallenge) return "invalid";
  if (activeChallenge.token !== token) return "invalid";
  if (activeChallenge.code !== (code ?? "")) return "invalid";
  if (activeChallenge.claimedAt) return "claimed";
  if (activeChallenge.expiresAt.getTime() <= Date.now()) return "expired";
  return "available";
}

/** 確保 instance 存在 admin 身分組且具 * 權限（供 claim 時使用） */
async function ensureAdminGroupExists(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
): Promise<void> {
  let groupRow = await tx
    .select({ id: instanceGroups.id })
    .from(instanceGroups)
    .where(eq(instanceGroups.name, ADMIN_GROUP_NAME))
    .then((rows) => rows[0] ?? null);
  if (!groupRow) {
    const inserted = await tx
      .insert(instanceGroups)
      .values({ name: ADMIN_GROUP_NAME })
      .returning({ id: instanceGroups.id });
    groupRow = inserted[0] ?? null;
  }
  if (!groupRow) return;
  const groupId = groupRow.id;
  const hasWildcard = await tx
    .select({ id: instanceGroupPermissions.id })
    .from(instanceGroupPermissions)
    .where(and(eq(instanceGroupPermissions.groupId, groupId), eq(instanceGroupPermissions.permissionKey, "*")))
    .then((rows) => rows[0] ?? null);
  if (!hasWildcard) {
    await tx.insert(instanceGroupPermissions).values({ groupId, permissionKey: "*" });
  }
}

export async function initializeBoardClaimChallenge(
  db: Db,
  opts: { deploymentMode: DeploymentMode },
): Promise<void> {
  if (opts.deploymentMode !== "authenticated") {
    activeChallenge = null;
    return;
  }

  const usersWithAdminGroup = await db
    .select({ userId: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.group, ADMIN_GROUP_NAME));

  const onlyLocalBoardAdmin =
    usersWithAdminGroup.length === 1 && usersWithAdminGroup[0]?.userId === LOCAL_BOARD_USER_ID;
  if (!onlyLocalBoardAdmin) {
    activeChallenge = null;
    return;
  }

  if (!activeChallenge || activeChallenge.expiresAt.getTime() <= Date.now() || activeChallenge.claimedAt) {
    activeChallenge = createChallenge();
  }
}

export function getBoardClaimWarningUrl(host: string, port: number): string | null {
  if (!activeChallenge) return null;
  if (activeChallenge.claimedAt || activeChallenge.expiresAt.getTime() <= Date.now()) return null;
  const visibleHost = host === "0.0.0.0" ? "localhost" : host;
  return `http://${visibleHost}:${port}/board-claim/${activeChallenge.token}?code=${activeChallenge.code}`;
}

export function inspectBoardClaimChallenge(token: string, code: string | undefined) {
  const status = getChallengeStatus(token, code);
  return {
    status,
    requiresSignIn: true,
    expiresAt: activeChallenge?.expiresAt?.toISOString() ?? null,
    claimedByUserId: activeChallenge?.claimedByUserId ?? null,
  };
}

export async function claimBoardOwnership(
  db: Db,
  opts: { token: string; code: string | undefined; userId: string },
): Promise<{ status: ChallengeStatus; claimedByUserId?: string }> {
  const status = getChallengeStatus(opts.token, opts.code);
  if (status !== "available") return { status };

  await db.transaction(async (tx) => {
    await ensureAdminGroupExists(tx);

    await tx
      .update(authUsers)
      .set({ group: ADMIN_GROUP_NAME, updatedAt: new Date() })
      .where(eq(authUsers.id, opts.userId));

    if (LOCAL_BOARD_USER_ID !== opts.userId) {
      await tx
        .update(authUsers)
        .set({ group: null, updatedAt: new Date() })
        .where(eq(authUsers.id, LOCAL_BOARD_USER_ID));
    }

    const allCompanies = await tx.select({ id: companies.id }).from(companies);
    for (const company of allCompanies) {
      const existing = await tx
        .select({ id: companyMemberships.id, status: companyMemberships.status })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.companyId, company.id),
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, opts.userId),
          ),
        )
        .then((rows) => rows[0] ?? null);

      if (!existing) {
        await tx.insert(companyMemberships).values({
          companyId: company.id,
          principalType: "user",
          principalId: opts.userId,
          status: "active",
          membershipRole: "owner",
        });
        continue;
      }

      if (existing.status !== "active") {
        await tx
          .update(companyMemberships)
          .set({ status: "active", membershipRole: "owner", updatedAt: new Date() })
          .where(eq(companyMemberships.id, existing.id));
      }
    }
  });

  if (activeChallenge && activeChallenge.token === opts.token) {
    activeChallenge.claimedAt = new Date();
    activeChallenge.claimedByUserId = opts.userId;
  }

  return { status: "claimed", claimedByUserId: opts.userId };
}
