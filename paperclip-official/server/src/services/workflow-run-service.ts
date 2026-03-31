import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, workflowRuns, workflowStepLogs } from "@paperclipai/db";
import type { SkillFlowStep, SkillFrontmatter } from "@paperclipai/shared";
import {
  requiresWorkflowRuntime,
  safeParseSkillFrontmatterFromMarkdown,
  workflowStepWorkerResultSchema,
} from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
import { loadCompanySkillsForInjection } from "./company-skill-bundle.js";
import { issueService } from "./issues.js";
import { evaluateWorkflowCondition } from "./workflow-condition-eval.js";
import { contextToTemplateValues, renderWorkflowTemplate } from "./workflow-template.js";
import { validateWorkflowFrontmatterTemplatePlaceholders } from "@paperclipai/shared";
import { resolveSkillValuesForWorkflow } from "./skill-injection.js";
import { logger } from "../middleware/logger.js";
import { emitWorkflowAuditEvent } from "./workflow-audit-notify.js";
import { csvEscapeCell } from "../lib/export-csv-params.js";
import { resolveWorkflowPromptStepOutput, type WorkflowPromptAgentHint } from "./workflow-prompt-llm.js";

const MAX_ADVANCE_ITERATIONS = 200;

/** 設為 1/true 時，無 worker 仍可用 server HTTP LLM 填 prompt（相容／除錯）。預設走 worker。 */
function isWorkflowServerPromptLlmEnabled(): boolean {
  const v = process.env.WORKFLOW_SERVER_PROMPT_LLM?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type WorkflowRunStatusRow =
  | "pending"
  | "running"
  | "waiting_prompt"
  | "waiting_checkpoint"
  | "waiting_approval"
  | "waiting_worker"
  | "waiting_child"
  | "completed"
  | "failed"
  | "cancelled";

type LoopExecState = {
  loopId: string;
  items: unknown[];
  itemIndex: number;
  bodyIds: string[];
  bodyIndex: number;
};

function normalizeSkillKey(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

function collectLoopBodyIds(flow: SkillFlowStep[]): Set<string> {
  const set = new Set<string>();
  for (const s of flow) {
    if (s.kind === "loop") {
      for (const b of s.body) set.add(b);
    }
  }
  return set;
}

function buildGraphCompletedFromLogs(
  logs: Array<{ stepId: string; status: string; meta: Record<string, unknown> | null }>,
  loopBodies: Set<string>,
): Set<string> {
  const done = new Set<string>();
  for (const row of logs) {
    if (row.status !== "completed") continue;
    if (loopBodies.has(row.stepId)) continue;
    done.add(row.stepId);
  }
  return done;
}

function parseListFromContext(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function serializeLoopItem(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string") return item;
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

/** 建立子 run 時不複製內部 workflow 狀態，避免污染子流程。 */
function stripInternalWorkflowContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out = { ...ctx };
  delete out.__workflowSkillMarkdown;
  delete out.__workflowBranches;
  delete out.__checkpointDecisions;
  delete out.__loopExec;
  delete out.__workflowApprovalGatePassed;
  delete out.__workflowApprovalRetry;
  delete out.__workflowApprovalDenyReasons;
  return out;
}

function readWorkflowApprovalState(ctx: Record<string, unknown>) {
  const gatePassed = (ctx.__workflowApprovalGatePassed as Record<string, boolean> | undefined) ?? {};
  const retry = (ctx.__workflowApprovalRetry as Record<string, boolean> | undefined) ?? {};
  const denyReasons = (ctx.__workflowApprovalDenyReasons as Record<string, string> | undefined) ?? {};
  return { gatePassed, retry, denyReasons };
}

function stepRequiresApprovalBefore(step: SkillFlowStep): boolean {
  return "require_approval_before" in step && step.require_approval_before === true;
}

/** Prompt 步驟完成後推進 loop 內層索引（與 submitPromptResult 行為一致）。 */
function advanceLoopExecAfterPromptComplete(
  ctx: Record<string, unknown>,
  flow: SkillFlowStep[],
  loopExec: LoopExecState,
): void {
  loopExec.bodyIndex += 1;
  if (loopExec.bodyIndex >= loopExec.bodyIds.length) {
    loopExec.itemIndex += 1;
    loopExec.bodyIndex = 0;
  }
  const loopStep = flow.find((s) => s.kind === "loop" && s.id === loopExec.loopId) as
    | Extract<SkillFlowStep, { kind: "loop" }>
    | undefined;
  if (loopStep && loopExec.itemIndex < loopExec.items.length) {
    ctx[loopStep.item_as] = serializeLoopItem(loopExec.items[loopExec.itemIndex]);
  }
  ctx.__loopExec = loopExec;
}

function isStepRunnableByBranches(
  step: SkillFlowStep,
  flow: SkillFlowStep[],
  branches: Record<string, "true" | "false">,
  checkpoints: Record<string, "approve" | "reject">,
): boolean {
  const sid = "id" in step && step.id ? step.id : "";
  for (const other of flow) {
    if (other.kind === "condition" && (other.if_true === sid || other.if_false === sid)) {
      const choice = branches[other.id];
      if (choice == null) return false;
      const want: "true" | "false" = other.if_true === sid ? "true" : "false";
      if (choice !== want) return false;
    }
    if (other.kind === "checkpoint" && (other.on_approve === sid || other.on_reject === sid)) {
      const d = checkpoints[other.id];
      if (d == null) return false;
      const want: "approve" | "reject" = other.on_approve === sid ? "approve" : "reject";
      if (d !== want) return false;
    }
  }
  return true;
}

function allGraphWorkDone(flow: SkillFlowStep[], graphCompleted: Set<string>, loopBodies: Set<string>): boolean {
  for (const s of flow) {
    const id = "id" in s && s.id ? s.id : "";
    if (!id) {
      /**
       * 先前 `continue` 會略過無 id 的 prompt，導致「只完成有 id 的第一步」時
       * `pickNext` 已無可執行步驟，但 `allGraphWorkDone` 仍為 true → 誤判整段 SOP 完成。
       * 與 {@link skillFrontmatterSchema} 一致：多步驟或非全 prompt 時每個 prompt 必須有 id。
       */
      if (s.kind === "prompt") return false;
      continue;
    }
    if (loopBodies.has(id)) continue;
    if (!graphCompleted.has(id)) return false;
  }
  return true;
}

function pickNextGraphStep(args: {
  flow: SkillFlowStep[];
  graphCompleted: Set<string>;
  loopBodies: Set<string>;
  branches: Record<string, "true" | "false">;
  checkpoints: Record<string, "approve" | "reject">;
}): SkillFlowStep | null {
  const candidates: SkillFlowStep[] = [];
  for (const step of args.flow) {
    const id = "id" in step && step.id ? step.id : "";
    if (!id) continue;
    if (args.loopBodies.has(id)) continue;
    if (args.graphCompleted.has(id)) continue;
    const deps = step.depends_on ?? [];
    if (!deps.every((d) => args.graphCompleted.has(d))) continue;
    if (!isStepRunnableByBranches(step, args.flow, args.branches, args.checkpoints)) continue;
    candidates.push(step);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => args.flow.indexOf(a) - args.flow.indexOf(b));
  return candidates[0] ?? null;
}

export function createWorkflowRunService(db: Db, storage: StorageService) {
  const issues = issueService(db);

  async function fetchRunDetail(companyId: string, runId: string) {
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)))
      .limit(1);
    if (!run) return null;
    const logs = await fetchLogs(runId);
    return { run, logs };
  }

  async function loadSkill(companyId: string, skillKey: string) {
    const loaded = await loadCompanySkillsForInjection({ db, storage, companyId });
    const key = normalizeSkillKey(skillKey);
    const row = loaded.find((s) => s.key === key);
    if (!row) return null;
    const fm = row.frontmatter;
    const flowLen = fm.flow?.length ?? 0;
    /** 與 requiresWorkflowRuntime 及聊天室 `/skill` 自動 startRun 對齊：多個 flow 步驟亦須走引擎。 */
    const needsWorkflowEngine = requiresWorkflowRuntime(fm) || flowLen > 1;
    if (!needsWorkflowEngine) return null;
    return row;
  }

  async function fetchLogs(runId: string) {
    return db
      .select()
      .from(workflowStepLogs)
      .where(eq(workflowStepLogs.runId, runId))
      .orderBy(workflowStepLogs.id);
  }

  function readInternalMaps(ctx: Record<string, unknown>) {
    const branches = (ctx.__workflowBranches as Record<string, "true" | "false"> | undefined) ?? {};
    const checkpoints = (ctx.__checkpointDecisions as Record<string, "approve" | "reject"> | undefined) ?? {};
    const loopExec = ctx.__loopExec as LoopExecState | undefined;
    return { branches, checkpoints, loopExec };
  }

  async function advanceRun(runId: string): Promise<void> {
    let iterations = 0;
    while (iterations++ < MAX_ADVANCE_ITERATIONS) {
      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
      if (!run) return;
      if (
        [
          "completed",
          "failed",
          "cancelled",
          "waiting_prompt",
          "waiting_checkpoint",
          "waiting_approval",
          "waiting_worker",
          "waiting_child",
        ].includes(run.status)
      ) {
        return;
      }

      const skillMd = run.context && typeof run.context === "object" ? (run.context as Record<string, unknown>).__workflowSkillMarkdown : null;
      if (typeof skillMd !== "string") {
        await failRun(runId, "Missing workflow skill snapshot in context");
        return;
      }

      const parsed = safeParseSkillFrontmatterFromMarkdown(skillMd);
      if (!parsed.success) {
        await failRun(runId, "Invalid skill markdown snapshot");
        return;
      }
      const fm = parsed.data as SkillFrontmatter;
      const flow = fm.flow ?? [];
      if (flow.length === 0) {
        await completeRun(runId);
        return;
      }

      /** 與 packages/shared skillFrontmatterSchema superRefine 對齊，避免執行期略過無 id prompt 而誤完成 run。 */
      const needsExplicitPromptIds = flow.length > 1 || flow.some((s) => s.kind !== "prompt");
      if (needsExplicitPromptIds) {
        for (const s of flow) {
          if (s.kind !== "prompt") continue;
          const pid = "id" in s && s.id ? String(s.id).trim() : "";
          if (!pid) {
            await failRun(runId, "Workflow prompt step missing id (required when flow has multiple steps or any non-prompt step)");
            return;
          }
        }
      }

      const ctx = { ...(run.context as Record<string, unknown>) };
      const { branches, checkpoints, loopExec } = readInternalMaps(ctx);
      const logs = await fetchLogs(runId);
      const loopBodies = collectLoopBodyIds(flow);
      const graphCompleted = buildGraphCompletedFromLogs(
        logs.map((l) => ({ stepId: l.stepId, status: l.status, meta: l.meta as Record<string, unknown> | null })),
        loopBodies,
      );

      const templateBase = contextToTemplateValues(ctx);

      let workflowPromptAgent: WorkflowPromptAgentHint = null;
      if (run.agentId) {
        const [agentRow] = await db
          .select({ adapterType: agents.adapterType, adapterConfig: agents.adapterConfig })
          .from(agents)
          .where(eq(agents.id, run.agentId))
          .limit(1);
        if (agentRow) {
          workflowPromptAgent = {
            adapterType: agentRow.adapterType,
            adapterConfig: agentRow.adapterConfig ?? {},
          };
        }
      }

      /** ---- Loop driver ---- */
      if (loopExec) {
        const loopStep = flow.find((s) => s.kind === "loop" && s.id === loopExec.loopId) as
          | Extract<SkillFlowStep, { kind: "loop" }>
          | undefined;
        if (!loopStep) {
          delete ctx.__loopExec;
          await db.update(workflowRuns).set({ context: ctx, updatedAt: new Date() }).where(eq(workflowRuns.id, runId));
          continue;
        }

        if (loopExec.itemIndex >= loopExec.items.length) {
          await db.insert(workflowStepLogs).values({
            runId,
            stepId: loopStep.id,
            status: "completed",
            input: `loop over ${loopStep.list_from}`,
            output: `iterations=${loopExec.items.length}`,
            meta: { kind: "loop" },
            startedAt: new Date(),
            completedAt: new Date(),
          });
          delete ctx.__loopExec;
          await db
            .update(workflowRuns)
            .set({
              context: ctx,
              currentStepId: null,
              pendingPrompt: null,
              status: "running",
              updatedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
          continue;
        }

        const bodyId = loopExec.bodyIds[loopExec.bodyIndex];
        if (bodyId == null) {
          loopExec.itemIndex += 1;
          loopExec.bodyIndex = 0;
          ctx.__loopExec = loopExec;
          ctx[loopStep.item_as] = serializeLoopItem(loopExec.items[loopExec.itemIndex]);
          await db.update(workflowRuns).set({ context: ctx, updatedAt: new Date() }).where(eq(workflowRuns.id, runId));
          continue;
        }

        const inner = flow.find((s) => "id" in s && s.id === bodyId);
        if (!inner || inner.kind !== "prompt") {
          await failRun(runId, `Loop body step ${bodyId} must be a prompt step`);
          return;
        }

        const values = {
          ...templateBase,
          [loopStep.item_as]: serializeLoopItem(loopExec.items[loopExec.itemIndex]),
        };
        const rendered = renderWorkflowTemplate(inner.template, values);
        const stepIdLoop = inner.id;
        if (!stepIdLoop) {
          await failRun(runId, "Loop prompt step must have id");
          return;
        }
        const apprLoop = readWorkflowApprovalState(ctx);
        if (
          stepRequiresApprovalBefore(inner) &&
          !apprLoop.gatePassed[stepIdLoop] &&
          !apprLoop.retry[stepIdLoop]
        ) {
          const msg = inner.name ? `${inner.name}\n${rendered}` : rendered;
          await db
            .update(workflowRuns)
            .set({
              status: "waiting_approval",
              currentStepId: stepIdLoop,
              pendingApproval: {
                stepId: stepIdLoop,
                messageRendered: msg.slice(0, 100_000),
                createdAt: new Date().toISOString(),
                gate: "before_step",
              },
              pendingWorker: null,
              context: ctx,
              updatedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
          return;
        }
        const useServerLlm = isWorkflowServerPromptLlmEnabled();
        if (run.agentId && !useServerLlm) {
          await db
            .update(workflowRuns)
            .set({
              status: "waiting_worker",
              currentStepId: stepIdLoop,
              pendingWorker: {
                stepId: stepIdLoop,
                kind: "prompt",
                payload: rendered,
                createdAt: new Date().toISOString(),
              },
              pendingApproval: null,
              context: ctx,
              updatedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
          return;
        }
        if (!run.agentId && !useServerLlm) {
          await failRun(
            runId,
            "Workflow requires agentId for worker-driven execution, or set WORKFLOW_SERVER_PROMPT_LLM=1 for server-side model completion.",
          );
          return;
        }
        const resolved = await resolveWorkflowPromptStepOutput({
          renderedInstruction: rendered,
          agent: workflowPromptAgent,
        });
        if (!resolved.ok) {
          await failRun(runId, resolved.error);
          return;
        }
        const text = resolved.text;
        if (text.length > 500_000) {
          await failRun(runId, "Prompt step output too large");
          return;
        }
        const nextCtx = {
          ...ctx,
          [loopStep.item_as]: serializeLoopItem(loopExec.items[loopExec.itemIndex]),
        };
        if (inner.output) {
          nextCtx[inner.output] = text;
        }
        await db.insert(workflowStepLogs).values({
          runId,
          stepId: inner.id!,
          status: "completed",
          input: rendered,
          output: text,
          meta: {
            autoFilled: true,
            promptOutputSource: resolved.source,
            loopId: loopExec.loopId,
            loopItemIndex: loopExec.itemIndex,
            loopBodyIndex: loopExec.bodyIndex,
          },
          startedAt: new Date(),
          completedAt: new Date(),
        });
        advanceLoopExecAfterPromptComplete(nextCtx, flow, loopExec);
        await db
          .update(workflowRuns)
          .set({
            context: nextCtx,
            pendingPrompt: null,
            pendingCheckpoint: null,
            status: "running",
            currentStepId: null,
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, runId));
        emitWorkflowAuditEvent({
          type: "workflow.prompt.completed",
          companyId: run.companyId,
          runId,
          stepId: inner.id!,
          autoFilled: true,
        });
        continue;
      }

      /** ---- Normal graph ---- */
      const next = pickNextGraphStep({ flow, graphCompleted, loopBodies, branches, checkpoints });
      if (!next) {
        const done = allGraphWorkDone(flow, graphCompleted, loopBodies);
        if (done) {
          await completeRun(runId);
        } else {
          await failRun(runId, "Workflow stalled: no runnable step");
        }
        return;
      }

      if (next.kind === "loop") {
        const items = parseListFromContext(ctx[next.list_from]);
        if (items.length === 0) {
          await db.insert(workflowStepLogs).values({
            runId,
            stepId: next.id,
            status: "completed",
            input: `loop ${next.list_from}`,
            output: "empty list",
            meta: { kind: "loop" },
            startedAt: new Date(),
            completedAt: new Date(),
          });
          await db
            .update(workflowRuns)
            .set({ currentStepId: null, pendingPrompt: null, status: "running", updatedAt: new Date() })
            .where(eq(workflowRuns.id, runId));
          continue;
        }
        const le: LoopExecState = {
          loopId: next.id,
          items,
          itemIndex: 0,
          bodyIds: next.body,
          bodyIndex: 0,
        };
        ctx.__loopExec = le;
        ctx[next.item_as] = serializeLoopItem(items[0]);
        await db
          .update(workflowRuns)
          .set({ context: ctx, status: "running", updatedAt: new Date() })
          .where(eq(workflowRuns.id, runId));
        continue;
      }

      if (next.kind === "prompt") {
        const rendered = renderWorkflowTemplate(next.template, templateBase);
        const stepIdGraph = next.id;
        if (!stepIdGraph) {
          await failRun(runId, "Prompt step must have id");
          return;
        }
        const apprGraph = readWorkflowApprovalState(ctx);
        if (
          stepRequiresApprovalBefore(next) &&
          !apprGraph.gatePassed[stepIdGraph] &&
          !apprGraph.retry[stepIdGraph]
        ) {
          const msg = next.name ? `${next.name}\n${rendered}` : rendered;
          await db
            .update(workflowRuns)
            .set({
              status: "waiting_approval",
              currentStepId: stepIdGraph,
              pendingApproval: {
                stepId: stepIdGraph,
                messageRendered: msg.slice(0, 100_000),
                createdAt: new Date().toISOString(),
                gate: "before_step",
              },
              pendingWorker: null,
              context: ctx,
              updatedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
          return;
        }
        const useServerLlmG = isWorkflowServerPromptLlmEnabled();
        if (run.agentId && !useServerLlmG) {
          await db
            .update(workflowRuns)
            .set({
              status: "waiting_worker",
              currentStepId: stepIdGraph,
              pendingWorker: {
                stepId: stepIdGraph,
                kind: "prompt",
                payload: rendered,
                createdAt: new Date().toISOString(),
              },
              pendingApproval: null,
              context: ctx,
              updatedAt: new Date(),
            })
            .where(eq(workflowRuns.id, runId));
          return;
        }
        if (!run.agentId && !useServerLlmG) {
          await failRun(
            runId,
            "Workflow requires agentId for worker-driven execution, or set WORKFLOW_SERVER_PROMPT_LLM=1 for server-side model completion.",
          );
          return;
        }
        const resolved = await resolveWorkflowPromptStepOutput({
          renderedInstruction: rendered,
          agent: workflowPromptAgent,
        });
        if (!resolved.ok) {
          await failRun(runId, resolved.error);
          return;
        }
        const text = resolved.text;
        if (text.length > 500_000) {
          await failRun(runId, "Prompt step output too large");
          return;
        }
        const nextCtx = { ...ctx };
        if (next.output) {
          nextCtx[next.output] = text;
        }
        await db.insert(workflowStepLogs).values({
          runId,
          stepId: next.id!,
          status: "completed",
          input: rendered,
          output: text,
          meta: { autoFilled: true, promptOutputSource: resolved.source },
          startedAt: new Date(),
          completedAt: new Date(),
        });
        const le = nextCtx.__loopExec as LoopExecState | undefined;
        if (le) {
          advanceLoopExecAfterPromptComplete(nextCtx, flow, le);
        }
        await db
          .update(workflowRuns)
          .set({
            context: nextCtx,
            pendingPrompt: null,
            pendingCheckpoint: null,
            status: "running",
            currentStepId: null,
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, runId));
        emitWorkflowAuditEvent({
          type: "workflow.prompt.completed",
          companyId: run.companyId,
          runId,
          stepId: next.id!,
          autoFilled: true,
        });
        continue;
      }

      if (next.kind === "checkpoint") {
        const rendered = renderWorkflowTemplate(next.message, templateBase);
        /** 一律自動核准並繼續，不進入 waiting_checkpoint。 */
        const decisions = { ...checkpoints, [next.id]: "approve" as const };
        ctx.__checkpointDecisions = decisions;
        await db.insert(workflowStepLogs).values({
          runId,
          stepId: next.id,
          status: "completed",
          input: rendered,
          output: "auto_approve",
          meta: { kind: "checkpoint", autoApproved: true },
          startedAt: new Date(),
          completedAt: new Date(),
        });
        await db
          .update(workflowRuns)
          .set({
            context: ctx,
            currentStepId: null,
            pendingCheckpoint: null,
            pendingPrompt: null,
            status: "running",
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, runId));
        emitWorkflowAuditEvent({
          type: "workflow.checkpoint.decided",
          companyId: run.companyId,
          runId,
          stepId: next.id,
          approve: true,
          autoApproved: true,
        });
        continue;
      }

      if (next.kind === "condition") {
        let choice: "true" | "false";
        try {
          const ok = evaluateWorkflowCondition(next.condition, templateBase);
          choice = ok ? "true" : "false";
        } catch (e) {
          await failRun(runId, e instanceof Error ? e.message : "Condition evaluation failed");
          return;
        }
        const nb = { ...branches, [next.id]: choice };
        ctx.__workflowBranches = nb;
        await db.insert(workflowStepLogs).values({
          runId,
          stepId: next.id,
          status: "completed",
          input: next.condition,
          output: choice,
          completedAt: new Date(),
          startedAt: new Date(),
        });
        await db
          .update(workflowRuns)
          .set({ context: ctx, currentStepId: null, status: "running", updatedAt: new Date() })
          .where(eq(workflowRuns.id, runId));
        continue;
      }

      if (next.kind === "action") {
        if (next.action === "create_issue") {
          try {
            const title = renderWorkflowTemplate(next.params.title ?? "Workflow issue", templateBase);
            const description = renderWorkflowTemplate(next.params.body ?? "", templateBase);
            await issues.create(run.companyId, {
              title,
              description: description || null,
              status: "backlog",
            });
          } catch (e) {
            await failRun(runId, e instanceof Error ? e.message : "create_issue failed");
            return;
          }
        }
        await db.insert(workflowStepLogs).values({
          runId,
          stepId: next.id,
          status: "completed",
          input: JSON.stringify(next.params),
          output: "ok",
          startedAt: new Date(),
          completedAt: new Date(),
        });
        await db
          .update(workflowRuns)
          .set({ currentStepId: null, status: "running", updatedAt: new Date() })
          .where(eq(workflowRuns.id, runId));
        continue;
      }

      if (next.kind === "invoke_workflow") {
        const inv = next as Extract<SkillFlowStep, { kind: "invoke_workflow" }>;
        const childSkill = await loadSkill(run.companyId, inv.skill_key);
        if (!childSkill) {
          await failRun(
            runId,
            `子工作流程技能未找到或無法執行（須為多步驟工作流程）: ${inv.skill_key}`,
          );
          return;
        }
        const renderedArgs = (inv.args ?? []).map((a) => renderWorkflowTemplate(a, templateBase).trim());
        const childValues = resolveSkillValuesForWorkflow(childSkill.frontmatter, renderedArgs);
        if (childValues == null) {
          await failRun(runId, `子工作流程參數無法解析: ${inv.skill_key}`);
          return;
        }

        const stripped = stripInternalWorkflowContext(ctx);
        const childCtx: Record<string, unknown> = {
          ...stripped,
          __workflowSkillMarkdown: childSkill.skillMarkdown,
          __workflowBranches: {},
          __checkpointDecisions: {},
          companyId: run.companyId,
          agentId: run.agentId ?? "",
          skillName: childSkill.frontmatter.name,
          ...childValues,
        };

        const [childInsert] = await db
          .insert(workflowRuns)
          .values({
            companyId: run.companyId,
            agentId: run.agentId,
            workflowName: childSkill.frontmatter.name,
            skillKey: childSkill.key,
            status: "running",
            context: childCtx,
            parentRunId: runId,
            parentInvokeStepId: inv.id,
          })
          .returning();

        if (!childInsert) {
          await failRun(runId, "無法建立子工作流程");
          return;
        }

        await db
          .update(workflowRuns)
          .set({
            status: "waiting_child",
            pendingChildRunId: childInsert.id,
            currentStepId: inv.id,
            pendingPrompt: null,
            pendingCheckpoint: null,
            context: ctx,
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, runId));

        emitWorkflowAuditEvent({
          type: "workflow.run.started",
          companyId: run.companyId,
          runId: childInsert.id,
          skillKey: childSkill.key,
          workflowName: childSkill.frontmatter.name,
        });

        await advanceRun(childInsert.id);
        return;
      }

      await failRun(runId, `Unsupported step kind: ${(next as SkillFlowStep).kind}`);
      return;
    }

    await failRun(runId, "Workflow advance exceeded max iterations");
  }

  /**
   * 子 run 成功結束後，將父 run 自 waiting_child 恢復並繼續推進。
   */
  async function resumeParentAfterChildCompleted(childRunId: string): Promise<void> {
    const [child] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, childRunId)).limit(1);
    if (!child?.parentRunId || !child.parentInvokeStepId) return;

    const parentId = child.parentRunId;
    const invokeStepId = child.parentInvokeStepId;

    const [parent] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, parentId)).limit(1);
    if (!parent || parent.pendingChildRunId !== childRunId || parent.status !== "waiting_child") return;

    const parentMd = (parent.context as Record<string, unknown>).__workflowSkillMarkdown;
    if (typeof parentMd !== "string") {
      await failRun(parentId, "父工作流程快照遺失");
      return;
    }
    const parsed = safeParseSkillFrontmatterFromMarkdown(parentMd);
    if (!parsed.success) {
      await failRun(parentId, "父工作流程快照無效");
      return;
    }
    const fm = parsed.data as SkillFrontmatter;
    const invokeStep = fm.flow?.find(
      (s) => "id" in s && s.id === invokeStepId && s.kind === "invoke_workflow",
    ) as Extract<SkillFlowStep, { kind: "invoke_workflow" }> | undefined;
    if (!invokeStep) {
      await failRun(parentId, "找不到對應的 invoke_workflow 步驟");
      return;
    }

    const nextCtx = { ...(parent.context as Record<string, unknown>) };
    if (invokeStep.output) {
      nextCtx[invokeStep.output] = JSON.stringify({
        childRunId,
        childSkillKey: child.skillKey,
        childWorkflowName: child.workflowName,
        status: "completed",
      });
    }

    await db.insert(workflowStepLogs).values({
      runId: parentId,
      stepId: invokeStepId,
      status: "completed",
      input: JSON.stringify({ skill_key: invokeStep.skill_key, args: invokeStep.args ?? [] }),
      output: `child_run=${childRunId}`,
      meta: { kind: "invoke_workflow", childRunId, childSkillKey: child.skillKey },
      startedAt: new Date(),
      completedAt: new Date(),
    });

    await db
      .update(workflowRuns)
      .set({
        context: nextCtx,
        status: "running",
        pendingChildRunId: null,
        currentStepId: null,
        pendingPrompt: null,
        pendingCheckpoint: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, parentId));

    await advanceRun(parentId);
  }

  /**
   * 子 run 失敗時，沿著 parent 鏈將仍處於 waiting_child 的祖先標記為失敗。
   */
  async function propagateChildFailureToAncestors(fromRunId: string, message: string): Promise<void> {
    const [child] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, fromRunId)).limit(1);
    if (!child?.parentRunId || !child.parentInvokeStepId) return;

    const parentId = child.parentRunId;

    const [parent] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, parentId)).limit(1);
    if (!parent || parent.pendingChildRunId !== child.id || parent.status !== "waiting_child") return;

    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        errorMessage: message,
        pendingChildRunId: null,
        currentStepId: null,
        pendingPrompt: null,
        pendingCheckpoint: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, parentId));

    emitWorkflowAuditEvent({
      type: "workflow.run.terminal",
      companyId: parent.companyId,
      runId: parentId,
      status: "failed",
    });

    await propagateChildFailureToAncestors(parentId, message);
  }

  async function failRun(runId: string, message: string) {
    logger.warn({ runId, message }, "workflow run failed");
    const [row] = await db
      .select({ companyId: workflowRuns.companyId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    await db
      .update(workflowRuns)
      .set({
        status: "failed",
        errorMessage: message,
        pendingPrompt: null,
        pendingCheckpoint: null,
        pendingApproval: null,
        pendingWorker: null,
        pendingChildRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
    if (row) {
      emitWorkflowAuditEvent({
        type: "workflow.run.terminal",
        companyId: row.companyId,
        runId,
        status: "failed",
      });
    }
    await propagateChildFailureToAncestors(runId, message);
  }

  async function completeRun(runId: string) {
    const [row] = await db
      .select({ companyId: workflowRuns.companyId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);
    await db
      .update(workflowRuns)
      .set({
        status: "completed",
        currentStepId: null,
        pendingPrompt: null,
        pendingCheckpoint: null,
        pendingApproval: null,
        pendingWorker: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
    if (row) {
      emitWorkflowAuditEvent({
        type: "workflow.run.terminal",
        companyId: row.companyId,
        runId,
        status: "completed",
      });
    }
    await resumeParentAfterChildCompleted(runId);
  }

  async function queryRuns(
    companyId: string,
    opts: { limit: number; workflowName?: string; status?: string },
  ) {
    const parts = [eq(workflowRuns.companyId, companyId)];
    const wn = opts.workflowName?.trim();
    if (wn) parts.push(eq(workflowRuns.workflowName, wn));
    const st = opts.status?.trim();
    if (st) parts.push(eq(workflowRuns.status, st));
    const cond = parts.length === 1 ? parts[0] : and(...parts);
    return db
      .select()
      .from(workflowRuns)
      .where(cond)
      .orderBy(desc(workflowRuns.createdAt))
      .limit(Math.min(opts.limit, 100));
  }

  async function cancelRunInternal(companyId: string, runId: string) {
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.companyId, companyId)))
      .limit(1);
    if (!run) throw Object.assign(new Error("Run not found"), { status: 404 });
    if (
      ![
        "pending",
        "running",
        "waiting_prompt",
        "waiting_checkpoint",
        "waiting_approval",
        "waiting_worker",
        "waiting_child",
      ].includes(run.status)
    ) {
      throw Object.assign(new Error("Run cannot be cancelled"), { status: 409 });
    }
    await db
      .update(workflowRuns)
      .set({
        status: "cancelled",
        pendingPrompt: null,
        pendingCheckpoint: null,
        pendingApproval: null,
        pendingWorker: null,
        pendingChildRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId));
    emitWorkflowAuditEvent({ type: "workflow.run.cancelled", companyId, runId });
  }

  return {
    async startRun(args: {
      companyId: string;
      skillKey: string;
      invocationArgs: string[];
      agentId: string | null;
      /** 自聊天觸發時綁定房間，便於核准訊息與通知 */
      chatRoomId?: string | null;
    }) {
      const row = await loadSkill(args.companyId, args.skillKey);
      if (!row) {
        throw Object.assign(new Error("Skill not found or not a workflow skill"), { status: 404 });
      }
      const ph = validateWorkflowFrontmatterTemplatePlaceholders(row.frontmatter);
      if (!ph.ok) {
        throw Object.assign(
          new Error(
            `Workflow 模板含未定義佔位符：${ph.unknownPlaceholders.join(", ")}。請於 arguments 註冊對應 name，或改為已宣告之步驟 output。`,
          ),
          { status: 422 },
        );
      }
      const values = resolveSkillValuesForWorkflow(row.frontmatter, args.invocationArgs);
      if (values == null) {
        throw Object.assign(new Error("Invalid or missing skill arguments"), { status: 422 });
      }

      const ctx: Record<string, unknown> = {
        __workflowSkillMarkdown: row.skillMarkdown,
        __workflowBranches: {},
        __checkpointDecisions: {},
        companyId: args.companyId,
        agentId: args.agentId ?? "",
        skillName: row.frontmatter.name,
        ...values,
      };

      const [inserted] = await db
        .insert(workflowRuns)
        .values({
          companyId: args.companyId,
          agentId: args.agentId,
          chatRoomId: args.chatRoomId ?? null,
          workflowName: row.frontmatter.name,
          skillKey: row.key,
          status: "running",
          context: ctx,
        })
        .returning();

      if (!inserted) throw new Error("Failed to create workflow run");
      emitWorkflowAuditEvent({
        type: "workflow.run.started",
        companyId: args.companyId,
        runId: inserted.id,
        skillKey: args.skillKey,
        workflowName: row.frontmatter.name,
      });
      await advanceRun(inserted.id);
      // advanceRun 會在同一次請求內推進狀態（例如等待人類輸入）。
      // 直接回傳 inserted.status 會造成回傳狀態與實際不一致，因此於此重新讀取最新狀態。
      const [latest] = await db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, inserted.id))
        .limit(1);

      return latest ?? inserted;
    },

    getRun: fetchRunDetail,

    async listRuns(companyId: string, opts: { limit: number; workflowName?: string; status?: string }) {
      return queryRuns(companyId, opts);
    },

    async exportRunsCsv(companyId: string, opts: { limit: number; workflowName?: string; status?: string }) {
      const rows = await queryRuns(companyId, opts);
      const header = [
        "id",
        "workflow_name",
        "skill_key",
        "status",
        "current_step_id",
        "created_at",
        "updated_at",
      ];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push(
          [
            csvEscapeCell(r.id),
            csvEscapeCell(r.workflowName),
            csvEscapeCell(r.skillKey),
            csvEscapeCell(r.status),
            csvEscapeCell(r.currentStepId ?? ""),
            csvEscapeCell(r.createdAt.toISOString()),
            csvEscapeCell(r.updatedAt.toISOString()),
          ].join(","),
        );
      }
      return `${lines.join("\n")}\n`;
    },

    async submitPromptResult(companyId: string, runId: string, outputText: string) {
      const detail = await fetchRunDetail(companyId, runId);
      if (!detail) throw Object.assign(new Error("Run not found"), { status: 404 });
      const { run, logs } = detail;
      if (run.status !== "waiting_prompt") {
        throw Object.assign(new Error("Run is not waiting for prompt result"), { status: 409 });
      }
      const stepId = run.currentStepId;
      if (!stepId || !run.pendingPrompt || run.pendingPrompt.stepId !== stepId) {
        throw Object.assign(new Error("Invalid pending prompt state"), { status: 409 });
      }

      const text = outputText.trim();
      if (text.length > 500_000) {
        throw Object.assign(new Error("Output too large"), { status: 422 });
      }

      const parsed = safeParseSkillFrontmatterFromMarkdown(
        (run.context as Record<string, unknown>).__workflowSkillMarkdown as string,
      );
      if (!parsed.success) throw new Error("Invalid snapshot");
      const fm = parsed.data as SkillFrontmatter;
      const step = fm.flow?.find((s) => "id" in s && s.id === stepId && s.kind === "prompt") as
        | Extract<SkillFlowStep, { kind: "prompt" }>
        | undefined;

      const ctx = { ...(run.context as Record<string, unknown>) };
      if (step?.output) {
        ctx[step.output] = text;
      }

      const openLog = [...logs].reverse().find((l) => l.stepId === stepId && l.status === "running");
      if (openLog) {
        await db
          .update(workflowStepLogs)
          .set({ status: "completed", output: text, completedAt: new Date() })
          .where(eq(workflowStepLogs.id, openLog.id));
      }

      const loopExec = ctx.__loopExec as LoopExecState | undefined;
      if (loopExec) {
        advanceLoopExecAfterPromptComplete(ctx, fm.flow ?? [], loopExec);
      }

      await db
        .update(workflowRuns)
        .set({
          context: ctx,
          pendingPrompt: null,
          status: "running",
          currentStepId: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));

      emitWorkflowAuditEvent({
        type: "workflow.prompt.completed",
        companyId: run.companyId,
        runId,
        stepId,
      });
      await advanceRun(runId);
    },

    async submitCheckpoint(companyId: string, runId: string, approve: boolean) {
      const detail = await fetchRunDetail(companyId, runId);
      if (!detail) throw Object.assign(new Error("Run not found"), { status: 404 });
      const { run, logs } = detail;
      if (run.status !== "waiting_checkpoint") {
        throw Object.assign(new Error("Run is not waiting for checkpoint"), { status: 409 });
      }
      const stepId = run.currentStepId;
      if (!stepId || !run.pendingCheckpoint || run.pendingCheckpoint.stepId !== stepId) {
        throw Object.assign(new Error("Invalid checkpoint state"), { status: 409 });
      }

      const parsed = safeParseSkillFrontmatterFromMarkdown(
        (run.context as Record<string, unknown>).__workflowSkillMarkdown as string,
      );
      if (!parsed.success) throw new Error("Invalid snapshot");
      const fm = parsed.data as SkillFrontmatter;
      const cp = fm.flow?.find((s) => s.kind === "checkpoint" && s.id === stepId) as
        | Extract<SkillFlowStep, { kind: "checkpoint" }>
        | undefined;
      if (!cp) throw new Error("Checkpoint step missing");

      const ctx = { ...(run.context as Record<string, unknown>) };
      const decisions = { ...((ctx.__checkpointDecisions as Record<string, "approve" | "reject">) ?? {}) };
      decisions[stepId] = approve ? "approve" : "reject";
      ctx.__checkpointDecisions = decisions;

      const openLog = [...logs].reverse().find((l) => l.stepId === stepId && l.status === "running");
      if (openLog) {
        await db
          .update(workflowStepLogs)
          .set({
            status: "completed",
            output: approve ? "approve" : "reject",
            completedAt: new Date(),
          })
          .where(eq(workflowStepLogs.id, openLog.id));
      }

      await db
        .update(workflowRuns)
        .set({
          context: ctx,
          pendingCheckpoint: null,
          status: "running",
          currentStepId: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));

      emitWorkflowAuditEvent({
        type: "workflow.checkpoint.decided",
        companyId: run.companyId,
        runId,
        stepId,
        approve,
      });
      await advanceRun(runId);
    },

    cancelRun: cancelRunInternal,

    async submitWorkflowApproval(
      companyId: string,
      runId: string,
      body: { decision: "allow" | "deny" | "cancel"; reason?: string },
    ) {
      if (body.decision === "cancel") {
        await cancelRunInternal(companyId, runId);
        return;
      }
      const detail = await fetchRunDetail(companyId, runId);
      if (!detail) throw Object.assign(new Error("Run not found"), { status: 404 });
      const { run } = detail;
      if (run.status !== "waiting_approval") {
        throw Object.assign(new Error("Run is not waiting for approval"), { status: 409 });
      }
      const stepId = run.currentStepId;
      if (!stepId || !run.pendingApproval || run.pendingApproval.stepId !== stepId) {
        throw Object.assign(new Error("Invalid approval state"), { status: 409 });
      }

      const ctx = { ...(run.context as Record<string, unknown>) };
      const gatePassed = { ...((ctx.__workflowApprovalGatePassed as Record<string, boolean> | undefined) ?? {}) };
      const retry = { ...((ctx.__workflowApprovalRetry as Record<string, boolean> | undefined) ?? {}) };
      const denyReasons = { ...((ctx.__workflowApprovalDenyReasons as Record<string, string> | undefined) ?? {}) };

      if (body.decision === "allow") {
        gatePassed[stepId] = true;
        delete retry[stepId];
        ctx.__workflowApprovalGatePassed = gatePassed;
        ctx.__workflowApprovalRetry = retry;
        ctx.__workflowApprovalDenyReasons = denyReasons;
        await db
          .update(workflowRuns)
          .set({
            context: ctx,
            status: "running",
            pendingApproval: null,
            pendingWorker: null,
            currentStepId: null,
            updatedAt: new Date(),
          })
          .where(eq(workflowRuns.id, runId));
        await advanceRun(runId);
        return;
      }

      const reason = (body.reason ?? "").trim() || "(no reason)";
      denyReasons[stepId] = reason;
      retry[stepId] = true;
      ctx.__workflowApprovalGatePassed = gatePassed;
      ctx.__workflowApprovalRetry = retry;
      ctx.__workflowApprovalDenyReasons = denyReasons;

      const parsedFm = safeParseSkillFrontmatterFromMarkdown(
        (ctx.__workflowSkillMarkdown as string) ?? "",
      );
      if (!parsedFm.success) throw new Error("Invalid snapshot");
      const fm = parsedFm.data as SkillFrontmatter;
      const flow = fm.flow ?? [];
      const step = flow.find((s) => "id" in s && s.id === stepId && s.kind === "prompt") as
        | Extract<SkillFlowStep, { kind: "prompt" }>
        | undefined;
      if (!step) {
        throw Object.assign(new Error("Approval step is not a prompt step"), { status: 422 });
      }
      const templateBase = contextToTemplateValues(ctx);
      const rendered = renderWorkflowTemplate(step.template, templateBase);
      const reasonSuffix =
        denyReasons[stepId] != null ? `\n\n[Human feedback — please adjust and retry]\n${denyReasons[stepId]}` : "";
      const payload = `${rendered}${reasonSuffix}`.slice(0, 1_000_000);

      await db
        .update(workflowRuns)
        .set({
          context: ctx,
          status: "waiting_worker",
          currentStepId: stepId,
          pendingWorker: {
            stepId,
            kind: "prompt",
            payload,
            createdAt: new Date().toISOString(),
          },
          pendingApproval: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));
      emitWorkflowAuditEvent({
        type: "workflow.approval.denied",
        companyId: run.companyId,
        runId,
        stepId,
        ...(body.reason?.trim() ? { reason: body.reason.trim() } : {}),
      });
    },

    async submitWorkerStepResult(companyId: string, runId: string, body: unknown) {
      const parsed = workflowStepWorkerResultSchema.safeParse(body);
      if (!parsed.success) {
        throw Object.assign(new Error("Invalid worker step result payload"), { status: 422 });
      }
      const result = parsed.data;
      const detail = await fetchRunDetail(companyId, runId);
      if (!detail) throw Object.assign(new Error("Run not found"), { status: 404 });
      const { run, logs } = detail;
      if (run.status !== "waiting_worker") {
        throw Object.assign(new Error("Run is not waiting for worker"), { status: 409 });
      }
      const stepId = run.currentStepId;
      if (!stepId || !run.pendingWorker || run.pendingWorker.stepId !== stepId) {
        throw Object.assign(new Error("Invalid worker step state"), { status: 409 });
      }
      if (result.status === "error") {
        await failRun(runId, result.error);
        return;
      }

      const fmParsed = safeParseSkillFrontmatterFromMarkdown(
        (run.context as Record<string, unknown>).__workflowSkillMarkdown as string,
      );
      if (!fmParsed.success) throw new Error("Invalid snapshot");
      const fm = fmParsed.data as SkillFrontmatter;
      const step = fm.flow?.find((s) => "id" in s && s.id === stepId && s.kind === "prompt") as
        | Extract<SkillFlowStep, { kind: "prompt" }>
        | undefined;
      if (!step) {
        throw Object.assign(new Error("Worker step is not a prompt step"), { status: 422 });
      }

      const outputs = result.outputs ?? {};
      let text = "";
      if (step.output != null && step.output in outputs && outputs[step.output] != null) {
        text = String(outputs[step.output]);
      } else if ("text" in outputs && outputs.text != null) {
        text = String(outputs.text);
      } else if (result.message != null && result.message.trim() !== "") {
        text = result.message.trim();
      }
      if (text.length > 500_000) {
        throw Object.assign(new Error("Output too large"), { status: 422 });
      }

      const ctx = { ...(run.context as Record<string, unknown>) };
      if (step.output) {
        ctx[step.output] = text;
      }
      const retry = { ...((ctx.__workflowApprovalRetry as Record<string, boolean> | undefined) ?? {}) };
      delete retry[stepId];
      ctx.__workflowApprovalRetry = retry;

      await db.insert(workflowStepLogs).values({
        runId,
        stepId,
        status: "completed",
        input: run.pendingWorker.payload.slice(0, 500_000),
        output: text,
        meta: {
          autoFilled: true,
          promptOutputSource: "worker" as const,
          schemaVersion: result.schemaVersion,
        },
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const loopExec = ctx.__loopExec as LoopExecState | undefined;
      if (loopExec) {
        advanceLoopExecAfterPromptComplete(ctx, fm.flow ?? [], loopExec);
      }

      await db
        .update(workflowRuns)
        .set({
          context: ctx,
          pendingPrompt: null,
          pendingCheckpoint: null,
          pendingApproval: null,
          pendingWorker: null,
          status: "running",
          currentStepId: null,
          updatedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));

      emitWorkflowAuditEvent({
        type: "workflow.prompt.completed",
        companyId: run.companyId,
        runId,
        stepId,
        autoFilled: true,
      });
      await advanceRun(runId);
    },
  };
}
