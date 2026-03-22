import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { activityService } from "../services/activity.js";
import { assertBoard, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";
import { issueService, logActivity } from "../services/index.js";
import { sanitizeRecord } from "../redaction.js";
import { formatActivityLogCsv } from "../services/activity.js";
import { parseExportCsvQuery } from "../lib/export-csv-params.js";

const createActivitySchema = z.object({
  actorType: z.enum(["agent", "user", "system"]).optional().default("system"),
  actorId: z.string().min(1),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  agentId: z.string().uuid().optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
});

export function activityRoutes(db: Db) {
  const router = Router();
  const svc = activityService(db);
  const issueSvc = issueService(db);

  async function resolveIssueByRef(rawId: string) {
    if (/^[A-Z]+-\d+$/i.test(rawId)) {
      return issueSvc.getByIdentifier(rawId);
    }
    return issueSvc.getById(rawId);
  }

  router.get("/companies/:companyId/activity", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "activity:read");

    const filters = {
      companyId,
      agentId: req.query.agentId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
    };
    const result = await svc.list(filters);
    res.json(result);
  });

  router.get("/companies/:companyId/activity/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "activity:read");

    let parsed;
    try {
      parsed = parseExportCsvQuery(req.query as Record<string, unknown>);
    } catch {
      res.status(400).json({ error: "Invalid cursor" });
      return;
    }

    const filters = {
      companyId,
      agentId: req.query.agentId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
    };

    const { rows, nextCursor } = await svc.listActivityForExport(
      companyId,
      filters,
      {
        range: parsed.range ?? {},
        limit: parsed.limit,
        cursor: parsed.cursor,
      },
    );

    const csv = formatActivityLogCsv(rows);
    const fromLabel = parsed.scopeAll
      ? "all"
      : parsed.range?.from
        ? new Date(parsed.range.from).toISOString().slice(0, 10)
        : "start";
    const toLabel = parsed.scopeAll
      ? "all"
      : parsed.range?.to
        ? new Date(parsed.range.to).toISOString().slice(0, 10)
        : "open";
    const filename = `activity-${companyId.slice(0, 8)}-${fromLabel}_${toLabel}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (nextCursor) {
      res.setHeader("X-Export-Truncated", "true");
      const nextPayload = Buffer.from(
        JSON.stringify({
          o: nextCursor.at.toISOString(),
          id: nextCursor.id,
        }),
        "utf8",
      ).toString("base64url");
      res.setHeader("X-Export-Next-Cursor", nextPayload);
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "compliance.export",
      entityType: "activity_export",
      entityId: companyId,
      details: { format: "csv", scopeAll: parsed.scopeAll },
    });

    res.send(csv);
  });

  router.post("/companies/:companyId/activity", validate(createActivitySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyPermission(db, req, companyId, "company:manage");
    const event = await svc.create({
      companyId,
      ...req.body,
      details: req.body.details ? sanitizeRecord(req.body.details) : null,
    });
    res.status(201).json(event);
  });

  router.get("/issues/:id/activity", async (req, res) => {
    const rawId = req.params.id as string;
    const issue = await resolveIssueByRef(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "activity:read");
    const result = await svc.forIssue(issue.id);
    res.json(result);
  });

  router.get("/issues/:id/runs", async (req, res) => {
    const rawId = req.params.id as string;
    const issue = await resolveIssueByRef(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "activity:read");
    const result = await svc.runsForIssue(issue.companyId, issue.id);
    res.json(result);
  });

  router.get("/heartbeat-runs/:runId/issues", async (req, res) => {
    const runId = req.params.runId as string;
    const result = await svc.issuesForRun(runId);
    res.json(result);
  });

  return router;
}
