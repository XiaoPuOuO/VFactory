import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { and, eq } from "drizzle-orm";
import { issues } from "@paperclipai/db";
import { issueService, logActivity } from "../services/index.js";
import { recordApplicationLog } from "../services/application-logs.js";

const alertBodySchema = z.object({
  companyId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(20000).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional().default("warning"),
  fingerprint: z.string().min(1).max(256).optional(),
  labels: z.record(z.string()).optional(),
});

function alertWebhookSecret(): string | null {
  const s = process.env.PAPERCLIP_ALERT_WEBHOOK_SECRET?.trim();
  return s || null;
}

function verifyToken(headerToken: string | undefined): boolean {
  const secret = alertWebhookSecret();
  if (!secret || !headerToken) return false;
  const a = Buffer.from(headerToken.trim(), "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Ingests external alerts (Alertmanager, cloud monitoring) and opens Issues.
 * Set PAPERCLIP_ALERT_WEBHOOK_SECRET and send the same value in header X-Paperclip-Alert-Token.
 */
export function platformAlertRoutes(db: Db) {
  const router = Router();
  const issuesApi = issueService(db);

  router.post("/webhooks/platform-alerts", async (req, res) => {
    if (!alertWebhookSecret()) {
      res.status(503).json({ error: "Alert webhook not configured" });
      return;
    }
    if (!verifyToken(req.header("x-paperclip-alert-token"))) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = alertBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    if (body.fingerprint) {
      const label = `alert:${body.fingerprint}`;
      const existing = await db
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.companyId, body.companyId), eq(issues.executionLabel, label)))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (existing) {
        res.status(200).json({ ok: true, deduped: true, issueId: existing.id });
        return;
      }
    }

    const descParts = [
      body.description ?? "",
      "",
      "source: alert",
      `severity: ${body.severity}`,
      body.labels ? `labels: ${JSON.stringify(body.labels)}` : "",
    ].filter(Boolean);

    const issue = await issuesApi.create(body.companyId, {
      title: `[alert] ${body.title}`,
      description: descParts.join("\n"),
      status: "todo",
      priority: body.severity === "critical" ? "high" : "medium",
      executionLabel: body.fingerprint ? `alert:${body.fingerprint}` : `alert:${Date.now()}`,
    });

    await logActivity(db, {
      companyId: body.companyId,
      actorType: "system",
      actorId: "platform-alert",
      action: "issue.created_from_alert",
      entityType: "issue",
      entityId: issue.id,
      details: { title: issue.title, severity: body.severity },
    });

    await recordApplicationLog(db, {
      level: "warn",
      message: `Alert ingested: ${body.title}`,
      companyId: body.companyId,
      context: { issueId: issue.id, severity: body.severity, fingerprint: body.fingerprint ?? null },
    });

    res.status(201).json({ ok: true, issueId: issue.id, identifier: issue.identifier });
  });

  return router;
}
