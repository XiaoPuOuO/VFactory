import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { costEvents, goals, issues, projects } from "@paperclipai/db";

type GoalReader = Pick<Db, "select">;
type DbWrite = Pick<Db, "select" | "update">;

export async function getDefaultCompanyGoal(db: GoalReader, companyId: string) {
  const activeRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        eq(goals.status, "active"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (activeRootGoal) return activeRootGoal;

  const anyRootGoal = await db
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.companyId, companyId),
        eq(goals.level, "company"),
        isNull(goals.parentId),
      ),
    )
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
  if (anyRootGoal) return anyRootGoal;

  return db
    .select()
    .from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.level, "company")))
    .orderBy(asc(goals.createdAt))
    .then((rows) => rows[0] ?? null);
}

const TERMINAL_ISSUE_STATUSES = ["done", "cancelled"] as const;

function addIntervalMs(now: Date, days: number, hours: number, minutes: number, seconds: number): Date {
  const out = new Date(now.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  out.setUTCHours(out.getUTCHours() + hours);
  out.setUTCMinutes(out.getUTCMinutes() + minutes);
  out.setUTCSeconds(out.getUTCSeconds() + seconds);
  return out;
}

/**
 * 若 goal 為一次性（one_time）且所有連結的 issue 皆已終態，則將 goal 標記為 achieved。
 * 若為定期（daily/weekly/monthly/custom）且所有連結的 issue 皆已終態，則設定 recurrence_next_refresh_at = now + interval，完成後等待該時間再進入下一週期。
 */
export async function tryAutoAchieveGoal(db: DbWrite, goalId: string): Promise<boolean> {
  const [goalRow] = await db
    .select({
      id: goals.id,
      status: goals.status,
      recurrence: goals.recurrence,
      recurrenceIntervalDays: goals.recurrenceIntervalDays,
      recurrenceIntervalHours: goals.recurrenceIntervalHours,
      recurrenceIntervalMinutes: goals.recurrenceIntervalMinutes,
      recurrenceIntervalSeconds: goals.recurrenceIntervalSeconds,
    })
    .from(goals)
    .where(eq(goals.id, goalId));
  if (!goalRow || goalRow.status === "achieved") return false;

  const nonTerminal = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(eq(issues.goalId, goalId), inArray(issues.status, ["backlog", "todo", "in_progress", "in_review", "blocked"])),
    );
  if (nonTerminal.length > 0) return false;

  const now = new Date();
  if (goalRow.recurrence === "one_time") {
    await db.update(goals).set({ status: "achieved", updatedAt: now }).where(eq(goals.id, goalId));
    return true;
  }

  const d = goalRow.recurrenceIntervalDays ?? 0;
  const h = goalRow.recurrenceIntervalHours ?? 0;
  const m = goalRow.recurrenceIntervalMinutes ?? 0;
  const s = goalRow.recurrenceIntervalSeconds ?? 0;
  if (d === 0 && h === 0 && m === 0 && s === 0) return false;
  const nextRefresh = addIntervalMs(now, d, h, m, s);
  await db
    .update(goals)
    .set({ recurrenceNextRefreshAt: nextRefresh, updatedAt: now })
    .where(eq(goals.id, goalId));
  return true;
}

export function goalService(db: Db) {
  return {
    list: (companyId: string) => db.select().from(goals).where(eq(goals.companyId, companyId)),

    getById: (id: string) =>
      db
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .then((rows) => rows[0] ?? null),

    getDefaultCompanyGoal: (companyId: string) => getDefaultCompanyGoal(db, companyId),

    create: (companyId: string, data: Omit<typeof goals.$inferInsert, "companyId">) => {
      const payload = { ...data, companyId } as typeof goals.$inferInsert & { companyId: string };
      const intervalZero =
        !(payload.recurrenceIntervalDays ?? 0) &&
        !(payload.recurrenceIntervalHours ?? 0) &&
        !(payload.recurrenceIntervalMinutes ?? 0) &&
        !(payload.recurrenceIntervalSeconds ?? 0);
      if (payload.recurrence === "daily" && intervalZero) payload.recurrenceIntervalDays = 1;
      if (payload.recurrence === "weekly" && intervalZero) payload.recurrenceIntervalDays = 7;
      if (payload.recurrence === "monthly" && intervalZero) payload.recurrenceIntervalDays = 30;
      return db.insert(goals).values(payload).returning().then((rows) => rows[0]);
    },

    update: (id: string, data: Partial<typeof goals.$inferInsert>) =>
      db
        .update(goals)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(goals.id, id))
        .returning()
        .then((rows) => rows[0] ?? null),

    remove: async (id: string) => {
      return db.transaction(async (tx) => {
        // NOTE: goal 可能被多個可選 FK 參照（issues/projects/cost_events/...）與自身 parentId 參照。
        // 這裡採用「解除關聯（set null）」策略，保留歷史 issue / cost event / project 記錄。
        const now = new Date();

        // 解除 issues -> goal 關聯
        await tx
          .update(issues)
          .set({ goalId: null, updatedAt: now })
          .where(eq(issues.goalId, id));

        // 解除 projects -> goal 關聯（legacy goalId 欄位）
        await tx
          .update(projects)
          .set({ goalId: null, updatedAt: now })
          .where(eq(projects.goalId, id));

        // 解除 cost events -> goal 關聯（保留帳務歷史）
        await tx
          .update(costEvents)
          .set({ goalId: null })
          .where(eq(costEvents.goalId, id));

        // 解除 goals 自身 parentId 參照，避免刪除父目標被子目標 FK 阻擋
        await tx
          .update(goals)
          .set({ parentId: null, updatedAt: now })
          .where(eq(goals.parentId, id));

        const [row] = await tx.delete(goals).where(eq(goals.id, id)).returning();
        return row ?? null;
      });
    },
  };
}
