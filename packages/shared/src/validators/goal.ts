import { z } from "zod";
import {
  GOAL_LEVELS,
  GOAL_RECURRENCES,
  GOAL_RECURRENCE_INTERVAL_DAYS_MAX,
  GOAL_RECURRENCE_INTERVAL_HOURS_MAX,
  GOAL_RECURRENCE_INTERVAL_MINUTES_MAX,
  GOAL_RECURRENCE_INTERVAL_SECONDS_MAX,
  GOAL_STATUSES,
} from "../constants.js";

const intervalDays = z.number().int().min(0).max(GOAL_RECURRENCE_INTERVAL_DAYS_MAX);
const intervalHours = z.number().int().min(0).max(GOAL_RECURRENCE_INTERVAL_HOURS_MAX);
const intervalMinutes = z.number().int().min(0).max(GOAL_RECURRENCE_INTERVAL_MINUTES_MAX);
const intervalSeconds = z.number().int().min(0).max(GOAL_RECURRENCE_INTERVAL_SECONDS_MAX);

const goalBaseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  level: z.enum(GOAL_LEVELS).optional().default("task"),
  status: z.enum(GOAL_STATUSES).optional().default("planned"),
  parentId: z.string().uuid().optional().nullable(),
  ownerAgentId: z.string().uuid().optional().nullable(),
  recurrence: z.enum(GOAL_RECURRENCES).optional().default("one_time"),
  recurrenceIntervalDays: intervalDays.optional().default(0),
  recurrenceIntervalHours: intervalHours.optional().default(0),
  recurrenceIntervalMinutes: intervalMinutes.optional().default(0),
  recurrenceIntervalSeconds: intervalSeconds.optional().default(0),
});

function customIntervalNotAllZero(data: {
  recurrence?: string;
  recurrenceIntervalDays?: number;
  recurrenceIntervalHours?: number;
  recurrenceIntervalMinutes?: number;
  recurrenceIntervalSeconds?: number;
}): boolean {
  if (data.recurrence !== "custom") return true;
  const d = data.recurrenceIntervalDays ?? 0;
  const h = data.recurrenceIntervalHours ?? 0;
  const m = data.recurrenceIntervalMinutes ?? 0;
  const s = data.recurrenceIntervalSeconds ?? 0;
  return d > 0 || h > 0 || m > 0 || s > 0;
}

export const createGoalSchema = goalBaseSchema.refine(customIntervalNotAllZero, {
  message: "自訂週期不可全部為 0",
  path: ["recurrenceIntervalDays"],
});

export type CreateGoal = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = goalBaseSchema.partial().refine(customIntervalNotAllZero, {
  message: "自訂週期不可全部為 0",
  path: ["recurrenceIntervalDays"],
});

export type UpdateGoal = z.infer<typeof updateGoalSchema>;
