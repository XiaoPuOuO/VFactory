import type { Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { forbidden, notFound, unauthorized } from "../errors.js";

export function assertBoard(req: Request) {
  if (req.actor.type === "banned") {
    throw forbidden("Account banned");
  }
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

/** 是否有權限查看／存取所有公司（local_implicit 或身分組權限 company.view.all / *） */
export function hasCompanyViewAll(req: Request): boolean {
  if (req.actor.type === "banned") return false;
  if (req.actor.source === "local_implicit") return true;
  const perms = req.actor.permissions ?? [];
  return perms.includes("*") || perms.includes("company.view.all");
}

/** 是否有權限存取 instance 設定相關路由（local_implicit 或身分組權限 admin.setting / *） */
export function hasInstanceSettingPermission(req: Request): boolean {
  if (req.actor.type === "banned") return false;
  if (req.actor.type !== "board") return false;
  if (req.actor.source === "local_implicit") return true;
  const perms = req.actor.permissions ?? [];
  return perms.includes("admin.setting") || perms.includes("*");
}

/** 未具 admin.setting 或 * 時拋錯，用於 instance 設定／封存公司／promote-admin 等路由 */
export function assertInstanceSetting(req: Request): void {
  if (!hasInstanceSettingPermission(req)) {
    throw forbidden("admin.setting or * required for instance settings");
  }
}

/**
 * 確認目前 actor 可存取該公司；若 req.tenantId 已設定，則一併驗證公司屬於該租戶。
 * 傳入 db 且 req.tenantId 存在時會非同步查詢公司並檢查 tenant_id。
 */
export async function assertCompanyAccess(
  req: Request,
  companyId: string,
  db?: Db,
): Promise<void> {
  if (req.actor.type === "none" || req.actor.type === "banned") {
    throw unauthorized();
  }
  if (req.tenantId && db) {
    const row = await db
      .select({ id: companies.id, tenantId: companies.tenantId })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row || row.tenantId !== req.tenantId) {
      throw notFound("Company not found");
    }
  }
  if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
    throw forbidden("Agent key cannot access another company");
  }
  if (req.actor.type === "board" && req.actor.source !== "local_implicit" && !hasCompanyViewAll(req)) {
    const allowedCompanies = req.actor.companyIds ?? [];
    if (!allowedCompanies.includes(companyId)) {
      throw forbidden("User does not have access to this company");
    }
  }
}

export function getActorInfo(req: Request) {
  if (req.actor.type === "none" || req.actor.type === "banned") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    return {
      actorType: "agent" as const,
      actorId: req.actor.agentId ?? "unknown-agent",
      agentId: req.actor.agentId ?? null,
      runId: req.actor.runId ?? null,
    };
  }

  return {
    actorType: "user" as const,
    actorId: req.actor.userId ?? "board",
    agentId: null,
    runId: req.actor.runId ?? null,
  };
}
