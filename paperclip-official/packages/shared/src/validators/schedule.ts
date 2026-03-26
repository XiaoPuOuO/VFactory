import { z } from "zod";

/** IANA 時區格式：Area/Location 或 Area/SubArea/Location，拒絕空字串與亂碼 */
const timezoneSchema = z
  .string()
  .min(1, "timezone is required")
  .regex(
    /^[A-Za-z0-9_+-]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?$/,
    "timezone must be IANA format e.g. America/New_York",
  );

/** 合理年份區間（2000～2200） */
const MIN_YEAR = 2000;
const MAX_YEAR = 2200;

/** YYYY-MM-DD 日期字串 */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine((s) => {
    const y = parseInt(s.slice(0, 4), 10);
    return y >= MIN_YEAR && y <= MAX_YEAR;
  }, `year must be ${MIN_YEAR}-${MAX_YEAR}`);

/** HH:mm 每日時刻 00:00～23:59 */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):([0-5]\d)$/, "time_of_day must be HH:mm (00:00-23:59)");

const scheduleWindowSchema = z.object({
  start: dateOnlySchema,
  end: dateOnlySchema,
}).refine((w) => w.start <= w.end, { message: "window start must be <= end", path: ["end"] });

/** 標準 5 欄 cron（分 時 日 月 週） */
const cronExpressionSchema = z
  .string()
  .min(1, "cron_expression is required for cron kind")
  .regex(
    /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/,
    "cron_expression must be 5 fields: minute hour day month weekday",
  );

const skillInvocationPayloadSchema = z
  .object({
    name: z.string().min(1).max(64),
    args: z.array(z.string()).max(64).optional().default([]),
  })
  .strict();

// v0: open payload record, but validate the standardized `skillInvocations` shape when present.
const payloadSchema = z
  .object({
    skillInvocations: z.array(skillInvocationPayloadSchema).optional(),
  })
  .passthrough()
  .optional()
  .nullable();

export const createScheduleSchema = z
  .object({
    /** 省略時若呼叫者為 agent 則預設為該 agent（排程自己） */
    agentId: z.string().uuid().optional(),
    name: z.string().min(1),
    scheduleKind: z.enum(["cron", "once", "ranges"]),
    timezone: timezoneSchema,
    payload: payloadSchema,
    enabled: z.boolean().optional().default(true),
    cronExpression: z.string().optional(),
    runAt: z.string().datetime({ offset: true }).optional(),
    timeOfDay: timeOfDaySchema.optional(),
    windows: z.array(scheduleWindowSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleKind === "cron") {
      const parsed = cronExpressionSchema.safeParse(data.cronExpression);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "cron kind requires valid cron_expression", path: ["cronExpression"] });
      }
    }
    if (data.scheduleKind === "once") {
      if (data.runAt == null || data.runAt === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "once kind requires run_at", path: ["runAt"] });
      } else {
        const t = new Date(data.runAt).getTime();
        if (!Number.isFinite(t) || t <= Date.now()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "run_at must be a future date/time", path: ["runAt"] });
        }
        const y = new Date(data.runAt).getUTCFullYear();
        if (y < MIN_YEAR || y > MAX_YEAR) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `run_at year must be ${MIN_YEAR}-${MAX_YEAR}`, path: ["runAt"] });
        }
      }
    }
    if (data.scheduleKind === "ranges") {
      if (!data.windows?.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ranges kind requires at least one window", path: ["windows"] });
      }
      if (!data.timeOfDay) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ranges kind requires time_of_day", path: ["timeOfDay"] });
      }
    }
  });

export type CreateSchedule = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z
  .object({
    name: z.string().min(1).optional(),
    timezone: timezoneSchema.optional(),
    payload: payloadSchema,
    enabled: z.boolean().optional(),
    cronExpression: z.string().optional(),
    runAt: z.string().datetime({ offset: true }).optional().nullable(),
    timeOfDay: timeOfDaySchema.optional(),
    windows: z.array(scheduleWindowSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.runAt !== undefined && data.runAt !== null && data.runAt !== "") {
      const t = new Date(data.runAt).getTime();
      if (!Number.isFinite(t)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "run_at must be valid ISO 8601", path: ["runAt"] });
      } else if (t <= Date.now()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "run_at must be a future date/time when set", path: ["runAt"] });
      }
      const y = new Date(data.runAt).getUTCFullYear();
      if (y < MIN_YEAR || y > MAX_YEAR) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `run_at year must be ${MIN_YEAR}-${MAX_YEAR}`, path: ["runAt"] });
      }
    }
  });

export type UpdateSchedule = z.infer<typeof updateScheduleSchema>;

export const listSchedulesQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  enabled: z.enum(["true", "false"]).optional(),
});

export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
