import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { applicationLogEntries } from "@paperclipai/db";
import { sanitizeRecord } from "../redaction.js";
import { incApplicationLogWrites } from "../telemetry/prometheus.js";

export type ApplicationLogLevel = "debug" | "info" | "warn" | "error";

export async function recordApplicationLog(
  db: Db,
  args: {
    level: ApplicationLogLevel | string;
    message: string;
    context?: Record<string, unknown>;
    companyId?: string | null;
  },
): Promise<void> {
  const context = args.context ? sanitizeRecord({ ...args.context }) : undefined;
  await db.insert(applicationLogEntries).values({
    companyId: args.companyId ?? null,
    level: args.level,
    message: args.message.slice(0, 65535),
    context: context as Record<string, unknown> | undefined,
  });
  incApplicationLogWrites();
}

export async function listApplicationLogs(
  db: Db,
  args: {
    companyId: string;
    limit: number;
    before?: Date;
  },
): Promise<Array<typeof applicationLogEntries.$inferSelect>> {
  const conditions: SQL[] = [eq(applicationLogEntries.companyId, args.companyId)];
  if (args.before) {
    conditions.push(lt(applicationLogEntries.createdAt, args.before));
  }
  return db
    .select()
    .from(applicationLogEntries)
    .where(and(...conditions))
    .orderBy(desc(applicationLogEntries.createdAt))
    .limit(Math.min(args.limit, 500));
}
