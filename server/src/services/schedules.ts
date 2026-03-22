import { and, asc, eq, lte } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentSchedules, agents } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { Cron } from "croner";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { addDays, format, parse } from "date-fns";
import { logger } from "../middleware/logger.js";

type AgentScheduleRow = typeof agentSchedules.$inferSelect;

/** 僅需 wakeup，型別與 heartbeat.WakeupOptions 相容以利注入 */
type WakeupOpts = {
  source?: "timer" | "assignment" | "on_demand" | "automation";
  triggerDetail?: "manual" | "ping" | "callback" | "system" | "scheduled";
  reason?: string | null;
  payload?: Record<string, unknown> | null;
  contextSnapshot?: Record<string, unknown>;
};
type WakeupFn = (agentId: string, opts?: WakeupOpts) => Promise<unknown>;

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 計算 ranges 類型排程的下一次執行時刻（UTC）。
 * 從 startDateStr（排程時區的某日 YYYY-MM-DD）開始逐日檢查，找第一個落在任一段 window 內且該日 time_of_day 的瞬間且 > afterUtc。
 * 若無則回傳 null（表示已跑完）。
 */
function computeNextRunAtRanges(
  timezone: string,
  windows: Array<{ start: string; end: string }>,
  timeOfDay: string,
  startDateStr: string,
  afterUtc: Date,
): Date | null {
  if (!windows?.length || !timeOfDay) return null;

  const [hh, mm] = timeOfDay.split(":").map(Number);
  let current = parse(startDateStr, "yyyy-MM-dd", new Date());
  const maxIterations = 366 * 2;
  let iterations = 0;

  while (iterations++ < maxIterations) {
    const dateStr = format(current, "yyyy-MM-dd");
    const inWindow = windows.some(
      (w) => dateStr >= w.start && dateStr <= w.end,
    );
    if (inWindow) {
      const localInTz = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        hh,
        mm,
        0,
      );
      const runAt = fromZonedTime(localInTz, timezone);
      if (runAt.getTime() > afterUtc.getTime()) {
        return runAt;
      }
    }
    current = addDays(current, 1);
  }

  return null;
}

/**
 * 取得排程時區下「今日」的日期字串 YYYY-MM-DD。
 */
function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now); // YYYY-MM-DD
}

/**
 * 依排程類型計算下一次執行時刻（UTC）。
 */
export function computeNextRunAt(
  schedule: AgentScheduleRow,
  now: Date,
): Date | null {
  const tz = schedule.timezone;

  if (schedule.scheduleKind === "cron" && schedule.cronExpression) {
    try {
      const cron = new Cron(schedule.cronExpression, { timezone: tz });
      const next = cron.nextRun(now);
      return next ?? null;
    } catch {
      return null;
    }
  }

  if (schedule.scheduleKind === "once") {
    return null;
  }

  if (schedule.scheduleKind === "ranges" && schedule.windows?.length && schedule.timeOfDay) {
    const todayStr = getTodayInTimezone(tz);
    let startDateStr = todayStr;
    if (schedule.lastTriggeredAt) {
      const zoned = toZonedTime(new Date(schedule.lastTriggeredAt), tz);
      startDateStr = format(
        addDays(
          new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()),
          1,
        ),
        "yyyy-MM-dd",
      );
    }
    return computeNextRunAtRanges(
      tz,
      schedule.windows,
      schedule.timeOfDay,
      startDateStr,
      now,
    );
  }

  return null;
}

/**
 * 預測未來 horizon 內最多 maxFires 次觸發（用於衝突檢測），不寫入 DB。
 */
export function predictScheduleFires(
  schedule: AgentScheduleRow,
  from: Date,
  horizonEnd: Date,
  maxFires: number,
): Date[] {
  const out: Date[] = [];
  if (!schedule.enabled) return out;

  if (schedule.scheduleKind === "once" && schedule.runAt) {
    const t = new Date(schedule.runAt);
    if (t.getTime() >= from.getTime() && t.getTime() <= horizonEnd.getTime()) out.push(t);
    return out;
  }

  if (schedule.scheduleKind === "cron" && schedule.cronExpression) {
    try {
      const cron = new Cron(schedule.cronExpression, { timezone: schedule.timezone });
      let t = from;
      let guard = 0;
      while (out.length < maxFires && guard++ < maxFires * 8) {
        const next = cron.nextRun(t);
        if (!next || next.getTime() > horizonEnd.getTime()) break;
        if (next.getTime() >= from.getTime()) out.push(next);
        t = new Date(next.getTime() + 1000);
      }
    } catch {
      return out;
    }
    return out;
  }

  if (schedule.scheduleKind === "ranges" && schedule.windows?.length && schedule.timeOfDay) {
    let synthetic: AgentScheduleRow = { ...schedule, lastTriggeredAt: null };
    let after = from;
    let guard = 0;
    while (out.length < maxFires && guard++ < maxFires * 10) {
      const next = computeNextRunAt(synthetic, after);
      if (!next || next.getTime() > horizonEnd.getTime()) break;
      if (next.getTime() >= from.getTime()) out.push(next);
      synthetic = { ...schedule, lastTriggeredAt: next };
      after = new Date(next.getTime() + 1000);
    }
  }
  return out;
}

export function scheduleService(
  db: Db,
  getHeartbeat: () => { wakeup: WakeupFn },
) {
  async function tickSchedules(now: Date) {
    const due = await db
      .select()
      .from(agentSchedules)
      .where(
        and(
          eq(agentSchedules.enabled, true),
          lte(agentSchedules.nextRunAt, now),
        ),
      );

    const heartbeat = getHeartbeat();
    let triggered = 0;

    for (const schedule of due) {
      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, schedule.agentId))
        .then((rows) => rows[0] ?? null);

      if (!agent || agent.companyId !== schedule.companyId) {
        await db
          .update(agentSchedules)
          .set({
            enabled: false,
            nextRunAt: null,
            updatedAt: new Date(),
          })
          .where(eq(agentSchedules.id, schedule.id));
        continue;
      }

      try {
        await heartbeat.wakeup(schedule.agentId, {
          source: "automation",
          triggerDetail: "scheduled",
          reason: "schedule_triggered",
          payload: schedule.payload ?? undefined,
          contextSnapshot: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            ...(schedule.payload as Record<string, unknown> ?? {}),
          },
        });
      } catch (err) {
        logger.warn(
          { err, scheduleId: schedule.id, agentId: schedule.agentId },
          "schedule tick: wakeup failed",
        );
      }

      const lastTriggeredAt = new Date();

      if (schedule.scheduleKind === "once") {
        await db
          .update(agentSchedules)
          .set({
            enabled: false,
            nextRunAt: null,
            lastTriggeredAt: lastTriggeredAt,
            updatedAt: new Date(),
          })
          .where(eq(agentSchedules.id, schedule.id));
      } else if (schedule.scheduleKind === "cron" || schedule.scheduleKind === "ranges") {
        const nextRunAt = computeNextRunAt(
          { ...schedule, lastTriggeredAt } as AgentScheduleRow,
          now,
        );
        await db
          .update(agentSchedules)
          .set({
            lastTriggeredAt: lastTriggeredAt,
            nextRunAt: nextRunAt,
            enabled: nextRunAt != null,
            updatedAt: new Date(),
          })
          .where(eq(agentSchedules.id, schedule.id));
      }

      triggered += 1;
    }

    return { triggered, checked: due.length };
  }

  async function list(companyId: string, filters?: { agentId?: string; enabled?: boolean }) {
    const conditions = [eq(agentSchedules.companyId, companyId)];
    if (filters?.agentId) conditions.push(eq(agentSchedules.agentId, filters.agentId));
    if (filters?.enabled !== undefined) conditions.push(eq(agentSchedules.enabled, filters.enabled));
    return db
      .select()
      .from(agentSchedules)
      .where(and(...conditions))
      .orderBy(asc(agentSchedules.nextRunAt));
  }

  async function getById(scheduleId: string, companyId: string) {
    const row = await db
      .select()
      .from(agentSchedules)
      .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    return row;
  }

  async function create(
    companyId: string,
    data: {
      agentId: string;
      name: string;
      scheduleKind: "cron" | "once" | "ranges";
      timezone: string;
      payload?: Record<string, unknown> | null;
      enabled?: boolean;
      cronExpression?: string | null;
      runAt?: string | null;
      timeOfDay?: string | null;
      windows?: Array<{ start: string; end: string }> | null;
    },
  ) {
    const agent = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, data.agentId), eq(agents.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!agent) throw badRequest("Agent not found or does not belong to this company");

    if (data.scheduleKind === "ranges" && data.windows?.length) {
      const todayStr = getTodayInTimezone(data.timezone);
      const hasFutureWindow = data.windows.some((w) => w.end >= todayStr);
      if (!hasFutureWindow) {
        throw badRequest("At least one window must have end date on or after today in the schedule timezone");
      }
    }

    let nextRunAt: Date | null = null;
    if (data.scheduleKind === "once" && data.runAt) {
      nextRunAt = new Date(data.runAt);
    } else if (data.scheduleKind === "cron" && data.cronExpression) {
      const next = computeNextRunAt(
        {
          ...data,
          id: "",
          companyId,
          lastTriggeredAt: null,
          nextRunAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as AgentScheduleRow,
        new Date(),
      );
      nextRunAt = next;
    } else if (data.scheduleKind === "ranges" && data.windows?.length && data.timeOfDay) {
      const todayStr = getTodayInTimezone(data.timezone);
      nextRunAt = computeNextRunAtRanges(
        data.timezone,
        data.windows,
        data.timeOfDay,
        todayStr,
        new Date(),
      );
    }

    const [inserted] = await db
      .insert(agentSchedules)
      .values({
        companyId,
        agentId: data.agentId,
        name: data.name,
        scheduleKind: data.scheduleKind,
        timezone: data.timezone,
        payload: data.payload ?? null,
        enabled: data.enabled ?? true,
        nextRunAt,
        cronExpression: data.scheduleKind === "cron" ? data.cronExpression : null,
        runAt: data.scheduleKind === "once" && data.runAt ? new Date(data.runAt) : null,
        timeOfDay: data.scheduleKind === "ranges" ? data.timeOfDay : null,
        windows: data.scheduleKind === "ranges" ? data.windows : null,
      })
      .returning();
    return inserted!;
  }

  async function update(
    scheduleId: string,
    companyId: string,
    data: Partial<{
      name: string;
      timezone: string;
      payload: Record<string, unknown> | null;
      enabled: boolean;
      cronExpression: string | null;
      runAt: string | null;
      timeOfDay: string | null;
      windows: Array<{ start: string; end: string }> | null;
    }>,
  ) {
    const existing = await getById(scheduleId, companyId);
    if (!existing) throw notFound("Schedule not found");

    const patch: Partial<typeof agentSchedules.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) patch.name = data.name;
    if (data.timezone !== undefined) patch.timezone = data.timezone;
    if (data.payload !== undefined) patch.payload = data.payload;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.cronExpression !== undefined) patch.cronExpression = data.cronExpression;
    if (data.runAt !== undefined) {
      patch.runAt = data.runAt != null && data.runAt !== "" ? new Date(data.runAt) : null;
    }
    if (data.timeOfDay !== undefined) patch.timeOfDay = data.timeOfDay;
    if (data.windows !== undefined) patch.windows = data.windows;

    const merged = { ...existing, ...patch };
    if (
      (merged.scheduleKind === "cron" && merged.cronExpression) ||
      (merged.scheduleKind === "once" && merged.runAt != null) ||
      (merged.scheduleKind === "ranges" && merged.windows?.length && merged.timeOfDay)
    ) {
      if (merged.scheduleKind === "once") {
        patch.nextRunAt = merged.runAt;
      } else {
        const next = computeNextRunAt(merged as AgentScheduleRow, new Date());
        patch.nextRunAt = next;
      }
    }

    const [updated] = await db
      .update(agentSchedules)
      .set(patch)
      .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.companyId, companyId)))
      .returning();
    return updated ?? null;
  }

  async function remove(scheduleId: string, companyId: string) {
    const existing = await getById(scheduleId, companyId);
    if (!existing) throw notFound("Schedule not found");
    await db
      .delete(agentSchedules)
      .where(and(eq(agentSchedules.id, scheduleId), eq(agentSchedules.companyId, companyId)));
    return existing;
  }

  async function listConflicts(companyId: string, horizonDays: number, thresholdSec: number) {
    const now = new Date();
    const horizonEnd = addDays(now, horizonDays);
    const rows = await list(companyId, { enabled: true });
    const byAgent = new Map<string, AgentScheduleRow[]>();
    for (const s of rows) {
      const arr = byAgent.get(s.agentId) ?? [];
      arr.push(s);
      byAgent.set(s.agentId, arr);
    }
    const conflicts: Array<{
      agentId: string;
      scheduleIdA: string;
      scheduleIdB: string;
      nextFireAtA: string;
      nextFireAtB: string;
      deltaSec: number;
    }> = [];
    for (const [agentId, listRow] of byAgent) {
      if (listRow.length < 2) continue;
      for (let i = 0; i < listRow.length; i++) {
        for (let j = i + 1; j < listRow.length; j++) {
          const a = listRow[i]!;
          const b = listRow[j]!;
          const firesA = predictScheduleFires(a, now, horizonEnd, 32);
          const firesB = predictScheduleFires(b, now, horizonEnd, 32);
          let bestDelta = Infinity;
          let bestPair: { ta: Date; tb: Date } | null = null;
          for (const ta of firesA) {
            for (const tb of firesB) {
              const d = Math.abs(ta.getTime() - tb.getTime()) / 1000;
              if (d < thresholdSec && d < bestDelta) {
                bestDelta = d;
                bestPair = { ta, tb };
              }
            }
          }
          if (bestPair && bestDelta < thresholdSec) {
            conflicts.push({
              agentId,
              scheduleIdA: a.id,
              scheduleIdB: b.id,
              nextFireAtA: bestPair.ta.toISOString(),
              nextFireAtB: bestPair.tb.toISOString(),
              deltaSec: bestDelta,
            });
          }
        }
      }
    }
    return conflicts;
  }

  return { tickSchedules, computeNextRunAt, list, getById, create, update, remove, listConflicts };
}
