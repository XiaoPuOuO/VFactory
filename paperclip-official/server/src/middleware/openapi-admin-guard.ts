import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";

async function getUserGroupName(db: Db, userId: string): Promise<string | null> {
  const row = await db
    .select({ group: authUsers.group })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .then((rows) => rows[0] ?? null);

  const group = row?.group;
  if (group == null) return null;
  const asString = String(group).trim();
  return asString.length > 0 ? asString : null;
}

function respondForbidden(res: Parameters<RequestHandler>[1]) {
  res.status(403).json({ error: "Forbidden" });
}

function respondUnauthorized(res: Parameters<RequestHandler>[1]) {
  res.status(401).json({ error: "Unauthorized" });
}

/**
 * 僅允許：已登入（board + session）且 authUsers.group === "admin" 的使用者存取 OpenAPI 文件端點。
 */
export function requireOpenApiAdminGroup(db: Db): RequestHandler {
  return async (req: Request, res, next) => {
    const actor = (req as any).actor as { type?: string; source?: string; userId?: string } | undefined;

    if (!actor || actor.type === "none" || !actor.userId) {
      respondUnauthorized(res);
      return;
    }

    if (actor.type !== "board" || actor.source !== "session") {
      respondForbidden(res);
      return;
    }

    const groupName = await getUserGroupName(db, actor.userId);
    if (groupName !== "admin") {
      respondForbidden(res);
      return;
    }

    next();
  };
}

