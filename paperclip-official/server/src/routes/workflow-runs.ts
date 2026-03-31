import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { workflowStepWorkerResultSchema } from "@paperclipai/shared";
import { z } from "zod";
import type { StorageService } from "../storage/types.js";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { assertBoard } from "./authz.js";
import { assertBoardOrAgentWorkflowWorker } from "./authz.js";
import { createWorkflowRunService } from "../services/workflow-run-service.js";
import type { ChatHeartbeat } from "../services/chat.js";
import { logger } from "../middleware/logger.js";
import { respondIfWorkflowRunsStorageUnavailable } from "../lib/workflow-runs-storage-error.js";
import { wakeAgentAfterWorkflowWorkerStep } from "../lib/workflow-worker-wakeup.js";

const runWorkflowSchema = z
  .object({
    args: z.array(z.string()).optional().default([]),
    agentId: z.string().uuid().nullable().optional(),
    chatRoomId: z.string().uuid().nullable().optional(),
  })
  .strict();

const workflowApprovalSchema = z
  .object({
    decision: z.enum(["allow", "deny", "cancel"]),
    reason: z.string().max(5000).optional(),
  })
  .strict();

const promptResultSchema = z
  .object({
    outputText: z.string().min(1).max(500_000),
  })
  .strict();

const checkpointSchema = z
  .object({
    approve: z.boolean(),
  })
  .strict();

const workflowRunStatusValues = [
  "pending",
  "running",
  "waiting_prompt",
  "waiting_checkpoint",
  "waiting_approval",
  "waiting_worker",
  "waiting_child",
  "completed",
  "failed",
  "cancelled",
] as const;

const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    workflowName: z.string().min(1).max(128).optional(),
    status: z.enum(workflowRunStatusValues).optional(),
  })
  .strict();

function assertBoardEditor(req: Request) {
  assertBoard(req);
}

export function workflowRunRoutes(db: Db, storage: StorageService, heartbeat?: ChatHeartbeat) {
  const router = Router();
  const svc = createWorkflowRunService(db, storage);

  router.post("/companies/:companyId/workflows/:skillKey/run", validate(runWorkflowSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillKey = req.params.skillKey as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);

    const body = req.body as z.infer<typeof runWorkflowSchema>;
    try {
      const inserted = await svc.startRun({
        companyId,
        skillKey,
        invocationArgs: body.args ?? [],
        agentId: body.agentId ?? null,
        chatRoomId: body.chatRoomId ?? null,
      });
      res.status(201).json({ runId: inserted.id, status: inserted.status });
    } catch (e: unknown) {
      if (respondIfWorkflowRunsStorageUnavailable(e, res)) return;
      const err = e as { status?: number; message?: string };
      if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
      if (err.status === 422) return res.status(422).json({ error: err.message ?? "Unprocessable" });
      logger.warn({ err: e, companyId, skillKey }, "workflow run start failed");
      res.status(500).json({ error: "Failed to start workflow run" });
    }
  });

  router.get("/companies/:companyId/workflow-runs", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      await assertCompanyAccess(req, companyId, db);
      const qParsed = listQuerySchema.safeParse(req.query);
      const q = qParsed.success
        ? qParsed.data
        : { limit: 50 as const, workflowName: undefined, status: undefined };
      const rows = await svc.listRuns(companyId, {
        limit: q.limit,
        workflowName: q.workflowName,
        status: q.status,
      });
      res.json({
        runs: rows.map((r) => ({
          id: r.id,
          workflowName: r.workflowName,
          skillKey: r.skillKey,
          status: r.status,
          currentStepId: r.currentStepId,
          pendingPrompt: r.pendingPrompt,
          pendingCheckpoint: r.pendingCheckpoint,
          pendingApproval: r.pendingApproval,
          pendingWorker: r.pendingWorker,
          chatRoomId: r.chatRoomId,
          pendingChildRunId: r.pendingChildRunId,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    } catch (e: unknown) {
      if (respondIfWorkflowRunsStorageUnavailable(e, res)) return;
      next(e);
    }
  });

  router.get("/companies/:companyId/workflow-runs/export.csv", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      await assertCompanyAccess(req, companyId, db);
      const qParsed = listQuerySchema.safeParse(req.query);
      const q = qParsed.success
        ? qParsed.data
        : { limit: 50 as const, workflowName: undefined, status: undefined };
      const csv = await svc.exportRunsCsv(companyId, {
        limit: q.limit,
        workflowName: q.workflowName,
        status: q.status,
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="workflow-runs.csv"');
      res.send(csv);
    } catch (e: unknown) {
      if (respondIfWorkflowRunsStorageUnavailable(e, res)) return;
      next(e);
    }
  });

  router.get("/companies/:companyId/workflow-runs/:runId", async (req, res, next) => {
    try {
      const companyId = req.params.companyId as string;
      const runId = req.params.runId as string;
      await assertCompanyAccess(req, companyId, db);
      const detail = await svc.getRun(companyId, runId);
      if (!detail) return res.status(404).json({ error: "Run not found" });
      const { run, logs } = detail;
      res.json({
        run: {
          id: run.id,
          companyId: run.companyId,
          agentId: run.agentId,
          workflowName: run.workflowName,
          skillKey: run.skillKey,
          status: run.status,
          currentStepId: run.currentStepId,
          context: sanitizeContextForClient(run.context as Record<string, unknown>),
          pendingPrompt: run.pendingPrompt,
          pendingCheckpoint: run.pendingCheckpoint,
          pendingApproval: run.pendingApproval,
          pendingWorker: run.pendingWorker,
          chatRoomId: run.chatRoomId,
          pendingChildRunId: run.pendingChildRunId,
          errorMessage: run.errorMessage,
          createdAt: run.createdAt.toISOString(),
          updatedAt: run.updatedAt.toISOString(),
        },
        logs: logs.map((l) => ({
          id: l.id,
          stepId: l.stepId,
          status: l.status,
          input: l.input,
          output: l.output,
          meta: l.meta,
          startedAt: l.startedAt?.toISOString() ?? null,
          completedAt: l.completedAt?.toISOString() ?? null,
        })),
      });
    } catch (e: unknown) {
      if (respondIfWorkflowRunsStorageUnavailable(e, res)) return;
      next(e);
    }
  });

  router.post(
    "/companies/:companyId/workflow-runs/:runId/prompt-result",
    validate(promptResultSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const runId = req.params.runId as string;
      assertBoardEditor(req);
      await assertCompanyAccess(req, companyId, db);
      const body = req.body as z.infer<typeof promptResultSchema>;
      try {
        await svc.submitPromptResult(companyId, runId, body.outputText);
        const detail = await svc.getRun(companyId, runId);
        res.json({ ok: true, status: detail?.run.status });
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
        if (err.status === 409) return res.status(409).json({ error: err.message ?? "Conflict" });
        if (err.status === 422) return res.status(422).json({ error: err.message ?? "Unprocessable" });
        logger.warn({ err: e, companyId, runId }, "workflow prompt-result failed");
        res.status(500).json({ error: "Failed to submit prompt result" });
      }
    },
  );

  router.post(
    "/companies/:companyId/workflow-runs/:runId/approval",
    validate(workflowApprovalSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const runId = req.params.runId as string;
      assertBoardEditor(req);
      await assertCompanyAccess(req, companyId, db);
      const body = req.body as z.infer<typeof workflowApprovalSchema>;
      try {
        await svc.submitWorkflowApproval(companyId, runId, body);
        const detail = await svc.getRun(companyId, runId);
        res.json({ ok: true, status: detail?.run.status });
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
        if (err.status === 409) return res.status(409).json({ error: err.message ?? "Conflict" });
        logger.warn({ err: e, companyId, runId }, "workflow approval failed");
        res.status(500).json({ error: "Failed to submit workflow approval" });
      }
    },
  );

  router.post(
    "/companies/:companyId/workflow-runs/:runId/worker-step-result",
    validate(workflowStepWorkerResultSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const runId = req.params.runId as string;
      await assertBoardOrAgentWorkflowWorker(req, db, companyId, runId);
      try {
        await svc.submitWorkerStepResult(companyId, runId, req.body);
        const detail = await svc.getRun(companyId, runId);
        if (heartbeat && detail?.run?.agentId && detail.run.chatRoomId) {
          try {
            await wakeAgentAfterWorkflowWorkerStep(heartbeat, detail.run);
          } catch (wakeErr: unknown) {
            logger.warn(
              { err: wakeErr, companyId, runId },
              "workflow worker-step-result: heartbeat wakeup failed",
            );
          }
        }
        res.json({ ok: true, status: detail?.run.status });
      } catch (e: unknown) {
        const err = e as { status?: number; message?: string };
        if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
        if (err.status === 409) return res.status(409).json({ error: err.message ?? "Conflict" });
        if (err.status === 422) return res.status(422).json({ error: err.message ?? "Unprocessable" });
        logger.warn({ err: e, companyId, runId }, "workflow worker-step-result failed");
        res.status(500).json({ error: "Failed to submit worker step result" });
      }
    },
  );

  router.post("/companies/:companyId/workflow-runs/:runId/checkpoint", validate(checkpointSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);
    const body = req.body as z.infer<typeof checkpointSchema>;
    try {
      await svc.submitCheckpoint(companyId, runId, body.approve);
      const detail = await svc.getRun(companyId, runId);
      res.json({ ok: true, status: detail?.run.status });
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
      if (err.status === 409) return res.status(409).json({ error: err.message ?? "Conflict" });
      logger.warn({ err: e, companyId, runId }, "workflow checkpoint failed");
      res.status(500).json({ error: "Failed to submit checkpoint" });
    }
  });

  router.delete("/companies/:companyId/workflow-runs/:runId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const runId = req.params.runId as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);
    try {
      await svc.cancelRun(companyId, runId);
      res.status(204).send();
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status === 404) return res.status(404).json({ error: err.message ?? "Not found" });
      if (err.status === 409) return res.status(409).json({ error: err.message ?? "Conflict" });
      res.status(500).json({ error: "Failed to cancel run" });
    }
  });

  return router;
}

function sanitizeContextForClient(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith("__")) continue;
    out[k] = v;
  }
  return out;
}
