import {
  type AnyPgColumn,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { goals } from "./goals.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { chatRooms } from "./chat_rooms.js";

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id),
    goalId: uuid("goal_id").references(() => goals.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => issues.id),
    /** 若此 issue 由聊天室對話建立，完成時會主動回報至該聊天室。 */
    sourceChatRoomId: uuid("source_chat_room_id").references(() => chatRooms.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("backlog"),
    priority: text("priority").notNull().default("medium"),
    assigneeAgentId: uuid("assignee_agent_id").references(() => agents.id),
    assigneeUserId: text("assignee_user_id"),
    checkoutRunId: uuid("checkout_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    executionRunId: uuid("execution_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    executionAgentNameKey: text("execution_agent_name_key"),
    executionLockedAt: timestamp("execution_locked_at", { withTimezone: true }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    issueNumber: integer("issue_number"),
    identifier: text("identifier"),
    requestDepth: integer("request_depth").notNull().default(0),
    billingCode: text("billing_code"),
    assigneeAdapterOverrides: jsonb("assignee_adapter_overrides").$type<Record<string, unknown>>(),
    executionWorkspaceSettings: jsonb("execution_workspace_settings").$type<Record<string, unknown>>(),
    /** Issue: 同 parent + 同 assignee 之子任務的執行語意（parallel | sequential | phased）與順序/階段。僅對有 children 的 issue 有意義。 */
    executionPolicy: jsonb("execution_policy").$type<{
      subtaskExecutionPolicy?: "parallel" | "sequential" | "phased";
      /** Sequential 時為 issue id 陣列；phased 時由 subtaskPhases 表示。 */
      subtaskExecutionOrder?: string[];
      /** Phased 時每 phase 為一組 issue id。 */
      subtaskPhases?: string[][];
    } | null>(),
    /** Issue: 顯示用標籤（如 Frontend-A），可帶入 run context / UI，不影響排程。 */
    executionLabel: text("execution_label"),
    /** PR／branch／CI 連結與狀態（手動維護，非 Git 整合）。 */
    vcsLinks: jsonb("vcs_links").$type<{
      prUrl?: string | null;
      branch?: string | null;
      ciStatus?: string | null;
      ciUrl?: string | null;
    } | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("issues_company_status_idx").on(table.companyId, table.status),
    assigneeStatusIdx: index("issues_company_assignee_status_idx").on(
      table.companyId,
      table.assigneeAgentId,
      table.status,
    ),
    assigneeUserStatusIdx: index("issues_company_assignee_user_status_idx").on(
      table.companyId,
      table.assigneeUserId,
      table.status,
    ),
    parentIdx: index("issues_company_parent_idx").on(table.companyId, table.parentId),
    projectIdx: index("issues_company_project_idx").on(table.companyId, table.projectId),
    identifierIdx: uniqueIndex("issues_identifier_idx").on(table.identifier),
  }),
);
