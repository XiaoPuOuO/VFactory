import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers, companies, companyMemberships, userNotificationPreferences } from "@paperclipai/db";
import { updateMeDeveloperModeSchema, updateMeNotificationPreferencesSchema } from "@paperclipai/shared";
import { unauthorized } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { hasCompanyViewAll } from "./authz.js";

/**
 * 當前登入使用者資料（帳號管理頁用）。
 * GET /api/me 回傳 id, name, email, image, group, permissions, createdAt, updatedAt。
 * permissions 為 instance 身分組權限鍵（含 * 表示全部）；用於 UI 顯示設定按鈕等（需 admin.setting 或 *）。
 * 僅 board 且具 userId 時可呼叫；local_implicit 無 DB 使用者則回傳合成資料（permissions 為 ["*"]）。
 */
export function meRoutes(db: Db) {
  const router = Router();

  router.get("/", async (req, res) => {
    if (req.actor.type !== "board") {
      throw unauthorized();
    }
    const userId = req.actor.userId;
    if (!userId) {
      throw unauthorized();
    }

    if (req.actor.source === "local_implicit") {
      res.json({
        id: userId,
        name: "Local Board",
        email: null,
        image: null,
        group: null,
        permissions: ["*"],
        canCreateCompany: true,
        developerMode: true,
        createdAt: null,
        updatedAt: null,
      });
      return;
    }

    const row = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        image: authUsers.image,
        group: authUsers.group,
        developerMode: authUsers.developerMode,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .then((rows) => rows[0] ?? null);

    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const permissions = req.actor.permissions ?? [];
    let canCreateCompany = hasCompanyViewAll(req);
    if (!canCreateCompany && req.tenantId) {
      const perms = req.actor.permissions ?? [];
      const hasInfinite = perms.includes("company.create.amount.infinite");
      const amountMatch = perms
        .filter((k): k is string => typeof k === "string" && /^company\.create\.amount\.\d+$/.test(k))
        .map((k) => parseInt(k.replace("company.create.amount.", ""), 10))
        .filter((n) => Number.isInteger(n) && n >= 0);
      const limit = hasInfinite ? Infinity : (amountMatch.length > 0 ? Math.max(...amountMatch) : 0);
      if (limit > 0 || limit === Infinity) {
        const ownedCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(companies)
          .innerJoin(
            companyMemberships,
            and(
              eq(companies.id, companyMemberships.companyId),
              eq(companyMemberships.principalType, "user"),
              eq(companyMemberships.principalId, userId),
              eq(companyMemberships.membershipRole, "owner"),
              eq(companyMemberships.status, "active"),
            ),
          )
          .where(eq(companies.tenantId, req.tenantId))
          .then((rows) => rows[0]?.count ?? 0);
        canCreateCompany = ownedCount < limit;
      }
    }
    res.json({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image ?? null,
      group: row.group ?? null,
      permissions,
      canCreateCompany,
      developerMode: row.developerMode,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  });

  /** 更新目前使用者的開發者模式旗標（僅本人）。 */
  router.patch("/", validate(updateMeDeveloperModeSchema), async (req, res) => {
    if (req.actor.type !== "board") {
      throw unauthorized();
    }
    const userId = req.actor.userId;
    if (!userId) {
      throw unauthorized();
    }

    const [updated] = await db
      .update(authUsers)
      .set({
        developerMode: req.body.developerMode === true,
        updatedAt: new Date(),
      })
      .where(eq(authUsers.id, userId))
      .returning({
        id: authUsers.id,
        developerMode: authUsers.developerMode,
      });

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ id: updated.id, developerMode: updated.developerMode });
  });

  router.get("/notification-preferences", async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized();
    }
    const row = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, req.actor.userId))
      .then((rows) => rows[0] ?? null);
    res.json({ emailEnabled: row?.emailEnabled ?? true });
  });

  router.patch("/notification-preferences", validate(updateMeNotificationPreferencesSchema), async (req, res) => {
    if (req.actor.type !== "board" || !req.actor.userId) {
      throw unauthorized();
    }
    const userId = req.actor.userId;
    const emailEnabled = req.body.emailEnabled === true;
    await db
      .insert(userNotificationPreferences)
      .values({ userId, emailEnabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userNotificationPreferences.userId,
        set: { emailEnabled, updatedAt: new Date() },
      });
    res.json({ emailEnabled });
  });

  return router;
}
