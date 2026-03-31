import { pgTable, uuid, varchar, text, timestamp, jsonb, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { chatRooms } from "./chat_rooms.js";

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "waiting_prompt"
  | "waiting_checkpoint"
  /** 執行前需人工 Allow／Deny／Cancel */
  | "waiting_approval"
  /** 等待同一 agent session／worker 领取並執行當前步驟 */
  | "waiting_worker"
  /** 父 run 正在等待子 run（invoke_workflow）結束 */
  | "waiting_child"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowPendingPrompt = {
  stepId: string;
  renderedPrompt: string;
  createdAt: string;
};

export type WorkflowPendingCheckpoint = {
  stepId: string;
  messageRendered: string;
  createdAt: string;
};

export type WorkflowPendingApprovalGate = "before_step";

/** 節點勾選 require_approval_before 時，進入 waiting_approval 並寫入此欄。 */
export type WorkflowPendingApproval = {
  stepId: string;
  messageRendered: string;
  createdAt: string;
  gate: WorkflowPendingApprovalGate;
};

/** waiting_worker 時，worker 领取步驟所需之最小資訊（與 context 快照並存）。 */
export type WorkflowPendingWorker = {
  stepId: string;
  kind: string;
  /** 已渲染之模板或步驟說明 */
  payload: string;
  createdAt: string;
};

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    workflowName: varchar("workflow_name", { length: 128 }).notNull(),
    skillKey: varchar("skill_key", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    currentStepId: varchar("current_step_id", { length: 64 }),
    context: jsonb("context").notNull().$type<Record<string, unknown>>().default({}),
    pendingPrompt: jsonb("pending_prompt").$type<WorkflowPendingPrompt | null>(),
    pendingCheckpoint: jsonb("pending_checkpoint").$type<WorkflowPendingCheckpoint | null>(),
    pendingApproval: jsonb("pending_approval").$type<WorkflowPendingApproval | null>(),
    pendingWorker: jsonb("pending_worker").$type<WorkflowPendingWorker | null>(),
    chatRoomId: uuid("chat_room_id").references(() => chatRooms.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    parentRunId: uuid("parent_run_id").references((): AnyPgColumn => workflowRuns.id, {
      onDelete: "set null",
    }),
    parentInvokeStepId: varchar("parent_invoke_step_id", { length: 64 }),
    pendingChildRunId: uuid("pending_child_run_id").references((): AnyPgColumn => workflowRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("workflow_runs_company_id_idx").on(table.companyId),
    companyStatusIdx: index("workflow_runs_company_status_idx").on(table.companyId, table.status),
    companyWorkflowIdx: index("workflow_runs_company_workflow_name_idx").on(table.companyId, table.workflowName),
    companyCreatedIdx: index("workflow_runs_created_at_idx").on(table.companyId, table.createdAt),
  }),
);

export const workflowStepLogs = pgTable(
  "workflow_step_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: varchar("step_id", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    input: text("input"),
    output: text("output"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    runIdx: index("workflow_step_logs_run_id_idx").on(table.runId),
  }),
);
