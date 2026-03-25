import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import type { IntegrationTokenScope } from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * 公司範圍內之唯讀／整合 API：board 與 agent 維持既有行為；service 須具備對應 scope。
 */
export async function assertCompanyIntegrationScope(
  db: Db,
  req: Request,
  companyId: string,
  scope: IntegrationTokenScope,
): Promise<void> {
  await assertCompanyAccess(req, companyId, db);
  if (req.actor.type === "service") {
    const scopes = req.actor.integrationScopes ?? [];
    if (!scopes.includes(scope)) {
      throw forbidden("Integration token missing required scope");
    }
    return;
  }
  if (req.actor.type === "agent") {
    return;
  }
  if (req.actor.type !== "board") {
    throw unauthorized();
  }
}
