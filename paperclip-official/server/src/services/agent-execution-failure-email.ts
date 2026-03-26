import { and, eq, inArray } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Db } from "@paperclipai/db";
import { agents, authUsers, companyMemberships, heartbeatRunEvents, companies, userNotificationPreferences } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";

export type AgentExecutionFailureEmailRun = {
  id: string;
  companyId: string;
  agentId: string;
  invocationSource: string | null;
  triggerDetail: string | null;
  status: string;
  errorCode: string | null;
  finishedAt: Date | null;
};

const AGENT_FAILURE_EMAIL_MARKER_EVENT_TYPE = "notification.agent_execution_failure_email_sent";

function sanitizeHeaderValue(value: string): string {
  // Avoid CRLF header injection (RFC 5321/5322). Keep it conservative and ASCII-only.
  return value.replace(/[\r\n]+/g, " ").replace(/"/g, "'");
}

function readNonEmptyEnv(key: string): string | null {
  const raw = process.env[key];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseSmtpPort(): number | null {
  const raw = process.env.MAIL_PORT;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveMailOptionsFromEnv() {
  const mailer = process.env.MAIL_MAILER?.trim().toLowerCase();
  if (mailer && mailer !== "smtp") return null;

  const host = readNonEmptyEnv("MAIL_HOST");
  const port = parseSmtpPort();
  const username = readNonEmptyEnv("MAIL_USERNAME");
  const password = readNonEmptyEnv("MAIL_PASSWORD");
  const encryption = process.env.MAIL_ENCRYPTION?.trim().toLowerCase() ?? "";
  const fromAddress = readNonEmptyEnv("MAIL_FROM_ADDRESS");
  const fromName = readNonEmptyEnv("MAIL_FROM_NAME");

  // SMTP 密碼與 host 從 env 取得；不可在 log 中輸出。
  if (!host || !port || !username || !password || !fromAddress) {
    return null;
  }

  const secure = encryption === "ssl";
  const requireTLS = encryption === "tls" || encryption === "starttls" || encryption === "";

  return {
    host,
    port,
    username,
    password,
    secure,
    requireTLS,
    fromAddress,
    fromName,
  };
}

async function hasAlreadySentMarker(
  db: Db,
  runId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(heartbeatRunEvents)
    .where(
      and(
        eq(heartbeatRunEvents.runId, runId),
        eq(heartbeatRunEvents.eventType, AGENT_FAILURE_EMAIL_MARKER_EVENT_TYPE),
      ),
    );
  return rows.length > 0;
}

async function resolveOwnerRecipients(db: Db, companyId: string): Promise<string[]> {
  const memberships = await db
    .select({ userId: companyMemberships.principalId })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.membershipRole, "owner"),
        eq(companyMemberships.status, "active"),
      ),
    );

  const ownerUserIds = Array.from(
    new Set(memberships.map((m) => m.userId).filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  if (ownerUserIds.length === 0) return [];

  // Missing rows => default enabled.
  const prefs = await db
    .select({ userId: userNotificationPreferences.userId, emailEnabled: userNotificationPreferences.emailEnabled })
    .from(userNotificationPreferences)
    .where(inArray(userNotificationPreferences.userId, ownerUserIds));

  const prefMap = new Map<string, boolean>(prefs.map((p) => [p.userId, p.emailEnabled]));

  const enabledUserIds = ownerUserIds.filter((uid) => prefMap.get(uid) !== false);
  if (enabledUserIds.length === 0) return [];

  const users = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(inArray(authUsers.id, enabledUserIds));

  const emails = Array.from(
    new Set(users.map((u) => u.email).filter((e): e is string => typeof e === "string" && e.length > 0)),
  );
  return emails;
}

export async function notifyAgentExecutionFailureEmail(
  db: Db,
  run: AgentExecutionFailureEmailRun,
): Promise<void> {
  if (run.status !== "failed" && run.status !== "timed_out") return;

  const mailOptions = resolveMailOptionsFromEnv();
  if (!mailOptions) {
    logger.warn(
      {
        envKeysMissing:
          [
            "MAIL_HOST",
            "MAIL_PORT",
            "MAIL_USERNAME",
            "MAIL_PASSWORD",
            "MAIL_ENCRYPTION",
            "MAIL_FROM_ADDRESS",
            "MAIL_FROM_NAME",
          ].filter((k) => !readNonEmptyEnv(k) && k !== "MAIL_ENCRYPTION"),
      },
      "agent execution failure email skipped: SMTP env invalid or missing",
    );
    return;
  }

  if (await hasAlreadySentMarker(db, run.id)) return;

  const recipients = await resolveOwnerRecipients(db, run.companyId);
  if (recipients.length === 0) return;

  // Avoid sending error message text (may contain user content). Keep it stable and safe.
  const base = (process.env.PAPERCLIP_PUBLIC_URL ?? "http://localhost:3100").replace(/\/$/, "");
  const runUrl = `${base}/agents/${run.agentId}/runs/${run.id}`;
  const finishedAtIso = run.finishedAt ? run.finishedAt.toISOString() : "unknown";

  // Optional names for readability; if unavailable, still send IDs.
  const [agentRow] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, run.agentId));
  const [companyRow] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, run.companyId));

  const agentName = agentRow?.name ?? run.agentId;
  const companyIdOrName = companyRow?.name ?? run.companyId;

  const subject = sanitizeHeaderValue(
    `[Paperclip] Agent 執行失敗 (${run.status}) - ${companyIdOrName}`,
  );

  const lines: string[] = [
    `Paperclip Agent 執行失敗通知`,
    ``,
    `companyId: ${run.companyId}`,
    `company: ${companyIdOrName}`,
    `agentId: ${run.agentId}`,
    `agent: ${agentName}`,
    `runId: ${run.id}`,
    `status: ${run.status}`,
    `invocationSource: ${run.invocationSource ?? ""}`,
    `triggerDetail: ${run.triggerDetail ?? ""}`,
    `errorCode: ${run.errorCode ?? ""}`,
    `finishedAt: ${finishedAtIso}`,
    ``,
    `查看詳情：`,
    runUrl,
  ];

  const fromName = mailOptions.fromName ? sanitizeHeaderValue(mailOptions.fromName) : null;
  const from = fromName ? `"${fromName}" <${mailOptions.fromAddress}>` : mailOptions.fromAddress;

  const transporter = nodemailer.createTransport({
    host: mailOptions.host,
    port: mailOptions.port,
    secure: mailOptions.secure,
    requireTLS: mailOptions.requireTLS,
    auth: { user: mailOptions.username, pass: mailOptions.password },
  });

  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject,
    text: lines.join("\n"),
  });

  // Best-effort marker insertion. It is only a "do not spam" guard and not a strong transactional guarantee.
  await db.insert(heartbeatRunEvents).values({
    companyId: run.companyId,
    runId: run.id,
    agentId: run.agentId,
    seq: Math.floor(Date.now() / 1000),
    eventType: AGENT_FAILURE_EMAIL_MARKER_EVENT_TYPE,
    stream: "system",
    level: "info",
    message: "agent execution failure email sent",
    payload: {
      status: run.status,
      errorCode: run.errorCode,
      triggerDetail: run.triggerDetail,
      invocationSource: run.invocationSource,
      runUrl,
    },
  });
}

