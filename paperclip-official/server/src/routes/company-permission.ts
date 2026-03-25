import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import type { PermissionKey } from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";
import { accessService } from "../services/access.js";
import { assertCompanyAccess } from "./authz.js";

function isLocalImplicit(req: Request) {
  return req.actor.type === "board" && req.actor.source === "local_implicit";
}

/**
 * 公司範圍權限：已通過 assertCompanyAccess 後，依 principal grants 與 membership 角色檢查。
 * local_implicit 略過；agent 僅檢查 hasPermission。
 */
export async function assertCompanyPermission(
  db: Db,
  req: Request,
  companyId: string,
  permissionKey: PermissionKey,
): Promise<void> {
  await assertCompanyAccess(req, companyId, db);
  if (req.actor.type === "service") {
    throw forbidden("Integration token cannot use this action");
  }
  const access = accessService(db);
  if (req.actor.type === "agent") {
    if (!req.actor.agentId) throw forbidden();
    const allowed = await access.hasPermission(
      companyId,
      "agent",
      req.actor.agentId,
      permissionKey,
    );
    if (!allowed) throw forbidden("Permission denied");
    return;
  }
  if (req.actor.type !== "board") throw unauthorized();
  if (isLocalImplicit(req)) return;
  const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
  if (!allowed) throw forbidden("Permission denied");
}
