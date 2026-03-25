import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Db } from "@paperclipai/db";
import {
  authUsers,
  companyNotificationDestinations,
  userNotificationPreferences,
} from "@paperclipai/db";
import type {
  CompanyNotificationDestination,
  CompanyWebhookEventType,
  CreateCompanyNotificationDestination,
  NotificationChannelType,
  UpdateCompanyNotificationDestination,
} from "@paperclipai/shared";
import { createCompanyNotificationDestinationSchema } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

const FETCH_TIMEOUT_MS = 12_000;

function maskSecretConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next = { ...config };
  if (typeof next.smtpPassword === "string") next.smtpPassword = "********";
  return next;
}

function buildSummary(
  event: CompanyWebhookEventType,
  payload: Record<string, unknown>,
): { subject: string; text: string } {
  const issueRef = typeof payload.issueRef === "string" ? payload.issueRef : null;
  const issueTitle = typeof payload.issueTitle === "string" ? payload.issueTitle : "";
  const bodySnippet = typeof payload.bodySnippet === "string" ? payload.bodySnippet : "";
  const authorLabel = typeof payload.authorLabel === "string" ? payload.authorLabel : "Someone";

  switch (event) {
    case "issue.comment_created":
      return {
        subject: `[Paperclip] 新留言 ${issueRef ?? ""}`.trim(),
        text: `${authorLabel} 在 ${issueRef ?? "issue"} 留言：\n\n${bodySnippet}\n\n${typeof payload.issueUrl === "string" ? payload.issueUrl : ""}`,
      };
    case "approval.created":
      return {
        subject: "[Paperclip] 待核准",
        text: `新的核准請求（${String(payload.type ?? "approval")}）\napprovalId: ${String(payload.approvalId ?? "")}`,
      };
    case "budget.limit_breached":
      return {
        subject: "[Paperclip] 預算／上限事件",
        text: `類型: ${String(payload.breachType ?? payload.breachId ?? "breach")}\n${JSON.stringify(payload.details ?? {}, null, 0)}`,
      };
    case "issue.created":
      return {
        subject: `[Paperclip] 新 Issue ${issueRef ?? ""}`.trim(),
        text: issueTitle || String(payload.issueId ?? ""),
      };
    case "issue.updated":
      return {
        subject: `[Paperclip] Issue 更新 ${issueRef ?? ""}`.trim(),
        text: issueTitle || String(payload.issueId ?? ""),
      };
    default:
      return {
        subject: `[Paperclip] ${event}`,
        text: JSON.stringify(payload, null, 2),
      };
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

async function deliverOneDestination(
  db: Db,
  dest: typeof companyNotificationDestinations.$inferSelect,
  event: CompanyWebhookEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  const recipientUserIds = Array.isArray(payload.recipientUserIds)
    ? (payload.recipientUserIds as string[]).filter((x): x is string => typeof x === "string")
    : [];

  const { subject, text } = buildSummary(event, payload);
  const slackText = `*${subject}*\n${text}`;

  const emailAllowed = async (userId: string): Promise<boolean> => {
    const pref = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .then((r) => r[0] ?? null);
    if (!pref) return true;
    return pref.emailEnabled !== false;
  };

  const resolveEmailsForUsers = async (userIds: string[]): Promise<string[]> => {
    if (userIds.length === 0) return [];
    const allowed: string[] = [];
    for (const uid of userIds) {
      if (!(await emailAllowed(uid))) continue;
      allowed.push(uid);
    }
    if (allowed.length === 0) return [];
    const users = await db
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(inArray(authUsers.id, allowed));
    return users.map((u) => u.email).filter(Boolean);
  };

  const channel = dest.channel as NotificationChannelType;
  const cfg = dest.config as Record<string, unknown>;

  if (channel === "email") {
    const smtpHost = String(cfg.smtpHost ?? "");
    const smtpPort = Number(cfg.smtpPort ?? 587);
    const smtpUser = String(cfg.smtpUser ?? "");
    const smtpPassword = String(cfg.smtpPassword ?? "");
    const fromAddress = String(cfg.fromAddress ?? "");
    const broadcastToEmails = Array.isArray(cfg.broadcastToEmails)
      ? (cfg.broadcastToEmails as string[]).filter((e) => typeof e === "string")
      : [];

    if (!smtpHost || !fromAddress || !smtpPassword) {
      logger.warn({ destinationId: dest.id }, "email destination missing SMTP fields");
      return;
    }

    const toList = new Set<string>();
    for (const e of broadcastToEmails) toList.add(e);
    const dynamic = await resolveEmailsForUsers(recipientUserIds);
    for (const e of dynamic) toList.add(e);

    if (toList.size === 0) return;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: cfg.smtpSecure === true,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    await transporter.sendMail({
      from: fromAddress,
      to: [...toList].join(", "),
      subject,
      text,
    });
    return;
  }

  if (channel === "slack" || channel === "discord") {
    const webhookUrl = String(cfg.webhookUrl ?? "");
    if (!webhookUrl) return;
    if (channel === "slack") {
      await postJson(webhookUrl, { text: slackText });
    } else {
      const content = slackText.slice(0, 1900);
      await postJson(webhookUrl, {
        content,
        username: "Paperclip",
      });
    }
  }
}

export function notificationDestinationService(db: Db) {
  return {
    list: async (companyId: string): Promise<CompanyNotificationDestination[]> => {
      const rows = await db
        .select()
        .from(companyNotificationDestinations)
        .where(eq(companyNotificationDestinations.companyId, companyId));
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        channel: row.channel as NotificationChannelType,
        name: row.name,
        enabled: row.enabled,
        eventSubscriptions: row.eventSubscriptions as CompanyWebhookEventType[],
        config: maskSecretConfig(row.config as Record<string, unknown>),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    },

    create: async (
      companyId: string,
      input: CreateCompanyNotificationDestination,
    ): Promise<CompanyNotificationDestination> => {
      const parsed = createCompanyNotificationDestinationSchema.parse(input);
      const [row] = await db
        .insert(companyNotificationDestinations)
        .values({
          companyId,
          channel: parsed.channel,
          name: parsed.name?.trim() || "Notification",
          enabled: parsed.enabled ?? true,
          eventSubscriptions: [...parsed.eventSubscriptions],
          config: parsed.config as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .returning();
      if (!row) throw new Error("Failed to create notification destination");
      return {
        id: row.id,
        companyId: row.companyId,
        channel: row.channel as NotificationChannelType,
        name: row.name,
        enabled: row.enabled,
        eventSubscriptions: row.eventSubscriptions as CompanyWebhookEventType[],
        config: maskSecretConfig(row.config as Record<string, unknown>),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    update: async (
      companyId: string,
      id: string,
      input: UpdateCompanyNotificationDestination,
    ): Promise<CompanyNotificationDestination | null> => {
      const existing = await db
        .select()
        .from(companyNotificationDestinations)
        .where(
          and(
            eq(companyNotificationDestinations.id, id),
            eq(companyNotificationDestinations.companyId, companyId),
          ),
        )
        .then((r) => r[0] ?? null);
      if (!existing) return null;

      const prevConfig = { ...(existing.config as Record<string, unknown>) };
      if (input.config) {
        for (const [k, v] of Object.entries(input.config)) {
          if (k === "smtpPassword" && v === "********") continue;
          prevConfig[k] = v;
        }
      }

      const patch: Partial<typeof companyNotificationDestinations.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.eventSubscriptions !== undefined) patch.eventSubscriptions = [...input.eventSubscriptions];
      if (input.config !== undefined) patch.config = prevConfig;

      const [row] = await db
        .update(companyNotificationDestinations)
        .set(patch)
        .where(
          and(
            eq(companyNotificationDestinations.id, id),
            eq(companyNotificationDestinations.companyId, companyId),
          ),
        )
        .returning();
      if (!row) return null;
      return {
        id: row.id,
        companyId: row.companyId,
        channel: row.channel as NotificationChannelType,
        name: row.name,
        enabled: row.enabled,
        eventSubscriptions: row.eventSubscriptions as CompanyWebhookEventType[],
        config: maskSecretConfig(row.config as Record<string, unknown>),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    delete: async (companyId: string, id: string): Promise<boolean> => {
      const deleted = await db
        .delete(companyNotificationDestinations)
        .where(
          and(
            eq(companyNotificationDestinations.id, id),
            eq(companyNotificationDestinations.companyId, companyId),
          ),
        )
        .returning({ id: companyNotificationDestinations.id });
      return deleted.length > 0;
    },

    /**
     * 讀取完整列（含密碼）僅供內部發送；不可回傳給 API。
     */
    getRowForDispatch: async (
      companyId: string,
      id: string,
    ): Promise<typeof companyNotificationDestinations.$inferSelect | null> => {
      return db
        .select()
        .from(companyNotificationDestinations)
        .where(
          and(
            eq(companyNotificationDestinations.id, id),
            eq(companyNotificationDestinations.companyId, companyId),
          ),
        )
        .then((r) => r[0] ?? null);
    },

    dispatch: async (
      companyId: string,
      event: CompanyWebhookEventType,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      const rows = await db
        .select()
        .from(companyNotificationDestinations)
        .where(eq(companyNotificationDestinations.companyId, companyId));

      const targets = rows.filter(
        (r) => r.enabled && (r.eventSubscriptions as string[]).includes(event),
      );
      if (targets.length === 0) return;

      await Promise.allSettled(
        targets.map(async (dest) => {
          try {
            await deliverOneDestination(db, dest, event, payload);
          } catch (err) {
            logger.warn(
              { err, destinationId: dest.id, channel: dest.channel, event },
              "notification destination delivery failed",
            );
          }
        }),
      );
    },

    /** 管理員測試：對單一目的地送出一則測試訊息（不檢查 eventSubscriptions） */
    sendTest: async (
      companyId: string,
      destinationId: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const row = await db
        .select()
        .from(companyNotificationDestinations)
        .where(
          and(
            eq(companyNotificationDestinations.id, destinationId),
            eq(companyNotificationDestinations.companyId, companyId),
          ),
        )
        .then((r) => r[0] ?? null);
      if (!row) return { ok: false, error: "Destination not found" };
      try {
        await deliverOneDestination(db, row, "issue.updated", {
          test: true,
          idempotencyKey: randomUUID(),
          issueId: "test",
          issueRef: "TEST-0",
          issueTitle: "Paperclip notification test",
          recipientUserIds: [],
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "send failed" };
      }
    },
  };
}

export type NotificationDestinationService = ReturnType<typeof notificationDestinationService>;
