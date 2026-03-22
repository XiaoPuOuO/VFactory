import { and, asc, desc, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { approvalComments, approvals } from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import { redactCurrentUserText } from "../log-redaction.js";
import type { ExportCsvCursor, ExportCsvDateRange } from "../lib/export-csv-params.js";
import { csvEscapeCell, EXPORT_CSV_MAX_LIMIT } from "../lib/export-csv-params.js";
import { redactEventPayload } from "../redaction.js";
import { agentService } from "./agents.js";
import { notifyHireApproved } from "./hire-hook.js";

function redactApprovalComment<T extends { body: string }>(comment: T): T {
  return {
    ...comment,
    body: redactCurrentUserText(comment.body),
  };
}

export interface ApprovalExportRow {
  id: string;
  type: string;
  status: string;
  requestedByAgentId: string | null;
  requestedByUserId: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  decisionSource: string;
  policyId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payloadJson: string;
}

export function formatApprovalsCsv(rows: ApprovalExportRow[]): string {
  const header = [
    "id",
    "type",
    "status",
    "requestedByAgentId",
    "requestedByUserId",
    "decidedByUserId",
    "decisionNote",
    "decisionSource",
    "policyId",
    "decidedAt",
    "createdAt",
    "updatedAt",
    "payloadJson",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.type,
        r.status,
        r.requestedByAgentId ?? "",
        r.requestedByUserId ?? "",
        r.decidedByUserId ?? "",
        r.decisionNote ?? "",
        r.decisionSource,
        r.policyId ?? "",
        r.decidedAt ? r.decidedAt.toISOString() : "",
        r.createdAt.toISOString(),
        r.updatedAt.toISOString(),
        r.payloadJson,
      ]
        .map(csvEscapeCell)
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function approvalService(db: Db) {
  const agentsSvc = agentService(db);
  const canResolveStatuses = new Set(["pending", "revision_requested"]);
  const resolvableStatuses = Array.from(canResolveStatuses);
  type ApprovalRecord = typeof approvals.$inferSelect;
  type ResolutionResult = { approval: ApprovalRecord; applied: boolean };

  async function getExistingApproval(id: string) {
    const existing = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, id))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Approval not found");
    return existing;
  }

  type ResolutionMeta = {
    decisionSource: "human" | "policy" | "system";
    policyId?: string | null;
    policySnapshot?: Record<string, unknown> | null;
  };

  async function resolveApproval(
    id: string,
    targetStatus: "approved" | "rejected",
    decidedByUserId: string | null,
    decisionNote: string | null | undefined,
    meta?: ResolutionMeta,
  ): Promise<ResolutionResult> {
    const existing = await getExistingApproval(id);
    if (!canResolveStatuses.has(existing.status)) {
      if (existing.status === targetStatus) {
        return { approval: existing, applied: false };
      }
      throw unprocessable(
        `Only pending or revision requested approvals can be ${targetStatus === "approved" ? "approved" : "rejected"}`,
      );
    }

    const decisionSource = meta?.decisionSource ?? "human";
    const now = new Date();
    const updated = await db
      .update(approvals)
      .set({
        status: targetStatus,
        decidedByUserId,
        decisionNote: decisionNote ?? null,
        decisionSource: targetStatus === "rejected" ? "human" : decisionSource,
        policyId: targetStatus === "approved" ? (meta?.policyId ?? null) : null,
        policySnapshot: targetStatus === "approved" ? (meta?.policySnapshot ?? null) : null,
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(approvals.id, id), inArray(approvals.status, resolvableStatuses)))
      .returning()
      .then((rows) => rows[0] ?? null);

    if (updated) {
      return { approval: updated, applied: true };
    }

    const latest = await getExistingApproval(id);
    if (latest.status === targetStatus) {
      return { approval: latest, applied: false };
    }

    throw unprocessable(
      `Only pending or revision requested approvals can be ${targetStatus === "approved" ? "approved" : "rejected"}`,
    );
  }

  return {
    list: (companyId: string, status?: string) => {
      const conditions = [eq(approvals.companyId, companyId)];
      if (status) conditions.push(eq(approvals.status, status));
      return db.select().from(approvals).where(and(...conditions));
    },

    getById: (id: string) =>
      db
        .select()
        .from(approvals)
        .where(eq(approvals.id, id))
        .then((rows) => rows[0] ?? null),

    create: (companyId: string, data: Omit<typeof approvals.$inferInsert, "companyId">) =>
      db
        .insert(approvals)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    approve: async (
      id: string,
      decidedByUserId: string | null,
      decisionNote?: string | null,
      meta?: ResolutionMeta,
    ) => {
      const { approval: updated, applied } = await resolveApproval(
        id,
        "approved",
        decidedByUserId,
        decisionNote,
        meta ?? { decisionSource: "human" },
      );

      let hireApprovedAgentId: string | null = null;
      const now = new Date();
      if (applied && updated.type === "hire_agent") {
        const payload = updated.payload as Record<string, unknown>;
        const payloadAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
        if (payloadAgentId) {
          await agentsSvc.activatePendingApproval(payloadAgentId);
          hireApprovedAgentId = payloadAgentId;
        } else {
          const created = await agentsSvc.create(updated.companyId, {
            name: String(payload.name ?? "New Agent"),
            role: String(payload.role ?? "general"),
            title: typeof payload.title === "string" ? payload.title : null,
            reportsTo: typeof payload.reportsTo === "string" ? payload.reportsTo : null,
            capabilities: typeof payload.capabilities === "string" ? payload.capabilities : null,
            adapterType: String(payload.adapterType ?? "process"),
            adapterConfig:
              typeof payload.adapterConfig === "object" && payload.adapterConfig !== null
                ? (payload.adapterConfig as Record<string, unknown>)
                : {},
            budgetMonthlyCents:
              typeof payload.budgetMonthlyCents === "number" ? payload.budgetMonthlyCents : 0,
            metadata:
              typeof payload.metadata === "object" && payload.metadata !== null
                ? (payload.metadata as Record<string, unknown>)
                : null,
            status: "idle",
            spentMonthlyCents: 0,
            permissions: undefined,
            lastHeartbeatAt: null,
          });
          hireApprovedAgentId = created?.id ?? null;
        }
        if (hireApprovedAgentId) {
          void notifyHireApproved(db, {
            companyId: updated.companyId,
            agentId: hireApprovedAgentId,
            source: "approval",
            sourceId: id,
            approvedAt: now,
          }).catch(() => {});
        }
      }

      return { approval: updated, applied };
    },

    reject: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const { approval: updated, applied } = await resolveApproval(
        id,
        "rejected",
        decidedByUserId,
        decisionNote,
        { decisionSource: "human" },
      );

      if (applied && updated.type === "hire_agent") {
        const payload = updated.payload as Record<string, unknown>;
        const payloadAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
        if (payloadAgentId) {
          await agentsSvc.terminate(payloadAgentId);
        }
      }

      return { approval: updated, applied };
    },

    requestRevision: async (id: string, decidedByUserId: string, decisionNote?: string | null) => {
      const existing = await getExistingApproval(id);
      if (existing.status !== "pending") {
        throw unprocessable("Only pending approvals can request revision");
      }

      const now = new Date();
      return db
        .update(approvals)
        .set({
          status: "revision_requested",
          decidedByUserId,
          decisionNote: decisionNote ?? null,
          decisionSource: "human",
          policyId: null,
          policySnapshot: null,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(approvals.id, id))
        .returning()
        .then((rows) => rows[0]);
    },

    resubmit: async (id: string, payload?: Record<string, unknown>) => {
      const existing = await getExistingApproval(id);
      if (existing.status !== "revision_requested") {
        throw unprocessable("Only revision requested approvals can be resubmitted");
      }

      const now = new Date();
      return db
        .update(approvals)
        .set({
          status: "pending",
          payload: payload ?? existing.payload,
          decisionNote: null,
          decidedByUserId: null,
          decisionSource: "human",
          policyId: null,
          policySnapshot: null,
          decidedAt: null,
          updatedAt: now,
        })
        .where(eq(approvals.id, id))
        .returning()
        .then((rows) => rows[0]);
    },

    listApprovalsForExport: async (
      companyId: string,
      opts: { range: ExportCsvDateRange; limit: number; cursor?: ExportCsvCursor },
    ): Promise<{
      rows: ApprovalExportRow[];
      nextCursor: ExportCsvCursor | null;
    }> => {
      const take = Math.min(Math.max(1, opts.limit), EXPORT_CSV_MAX_LIMIT);
      const conditions = [eq(approvals.companyId, companyId)];

      if (opts.range.from) conditions.push(gte(approvals.createdAt, opts.range.from));
      if (opts.range.to) conditions.push(lte(approvals.createdAt, opts.range.to));

      if (opts.cursor) {
        const c = opts.cursor;
        conditions.push(
          or(
            lt(approvals.createdAt, c.at),
            and(eq(approvals.createdAt, c.at), lt(approvals.id, c.id)),
          )!,
        );
      }

      const rawRows = await db
        .select()
        .from(approvals)
        .where(and(...conditions))
        .orderBy(desc(approvals.createdAt), desc(approvals.id))
        .limit(take + 1);

      const hasMore = rawRows.length > take;
      const slice = rawRows.slice(0, take);
      const last = slice[slice.length - 1];
      const nextCursor =
        hasMore && last ? { at: last.createdAt, id: last.id } : null;

      const rows: ApprovalExportRow[] = slice.map((row) => {
        const redacted = redactEventPayload(row.payload as Record<string, unknown>);
        return {
          id: row.id,
          type: row.type,
          status: row.status,
          requestedByAgentId: row.requestedByAgentId ?? null,
          requestedByUserId: row.requestedByUserId ?? null,
          decidedByUserId: row.decidedByUserId ?? null,
          decisionNote: row.decisionNote ?? null,
          decisionSource: row.decisionSource,
          policyId: row.policyId ?? null,
          decidedAt: row.decidedAt ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          payloadJson: redacted != null ? JSON.stringify(redacted) : "",
        };
      });

      return { rows, nextCursor };
    },

    listComments: async (approvalId: string) => {
      const existing = await getExistingApproval(approvalId);
      return db
        .select()
        .from(approvalComments)
        .where(
          and(
            eq(approvalComments.approvalId, approvalId),
            eq(approvalComments.companyId, existing.companyId),
          ),
        )
        .orderBy(asc(approvalComments.createdAt))
        .then((comments) => comments.map(redactApprovalComment));
    },

    addComment: async (
      approvalId: string,
      body: string,
      actor: { agentId?: string; userId?: string },
    ) => {
      const existing = await getExistingApproval(approvalId);
      const redactedBody = redactCurrentUserText(body);
      return db
        .insert(approvalComments)
        .values({
          companyId: existing.companyId,
          approvalId,
          authorAgentId: actor.agentId ?? null,
          authorUserId: actor.userId ?? null,
          body: redactedBody,
        })
        .returning()
        .then((rows) => redactApprovalComment(rows[0]));
    },
  };
}
