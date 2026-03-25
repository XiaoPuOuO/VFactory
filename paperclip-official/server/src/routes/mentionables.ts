import { and, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { agents, authUsers, companyMemberships } from "@paperclipai/db";
import { assertBoard, assertCompanyAccess } from "./authz.js";

/**
 * 公司內可 @提及的成員（人類 + agent），供 Issue 留言自動完成。
 * GET /api/companies/:companyId/mentionables
 */
export function mentionablesRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/mentionables", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);

    const agentRows = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.companyId, companyId));

    const memberships = await db
      .select({ principalId: companyMemberships.principalId })
      .from(companyMemberships)
      .where(
        and(
          eq(companyMemberships.companyId, companyId),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.status, "active"),
        ),
      );

    const userIds = memberships.map((m) => m.principalId);
    const userRows =
      userIds.length > 0
        ? await db
            .select({ id: authUsers.id, name: authUsers.name })
            .from(authUsers)
            .where(inArray(authUsers.id, userIds))
        : [];

    res.json({
      agents: agentRows.map((a) => ({ id: a.id, name: a.name, kind: "agent" as const })),
      users: userRows.map((u) => ({ id: u.id, name: u.name, kind: "user" as const })),
    });
  });

  return router;
}
