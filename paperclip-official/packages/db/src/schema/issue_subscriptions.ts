import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

/** 使用者訂閱議題：新留言時可收到站外通知（與 issue_read_states 已讀狀態分離）。 */
export const issueSubscriptions = pgTable(
  "issue_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    issueUserUnique: uniqueIndex("issue_subscriptions_issue_user_uq").on(table.issueId, table.userId),
    companyIdx: index("issue_subscriptions_company_idx").on(table.companyId),
    issueIdx: index("issue_subscriptions_issue_idx").on(table.issueId),
  }),
);
