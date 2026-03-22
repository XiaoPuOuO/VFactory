import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns } from "@paperclipai/db";
import type { HeartbeatRunErrorCluster, HeartbeatRunQualitySummary } from "@paperclipai/shared";
import { normalizeRunErrorForCluster } from "../utils/run-error-normalize.js";

const FAILED_STATUSES = ["failed", "timed_out"] as const;

export function runQualityService(db: Db) {
  return {
    async qualitySummary(companyId: string, from: Date, to: Date): Promise<HeartbeatRunQualitySummary> {
      const durationAvgMs = sql<number | null>`avg(
        case
          when ${heartbeatRuns.startedAt} is not null and ${heartbeatRuns.finishedAt} is not null
          then extract(epoch from (${heartbeatRuns.finishedAt} - ${heartbeatRuns.startedAt})) * 1000
          else null
        end
      )`;

      const tokenSum = sql<bigint>`coalesce(
        sum(
          coalesce((${heartbeatRuns.usageJson} ->> 'inputTokens')::bigint, 0)
          + coalesce((${heartbeatRuns.usageJson} ->> 'outputTokens')::bigint, 0)
        ),
        0
      )`;

      const companyRow = await db
        .select({
          totalRuns: sql<number>`count(*)::int`,
          succeeded: sql<number>`coalesce(sum(case when ${heartbeatRuns.status} = 'succeeded' then 1 else 0 end), 0)::int`,
          failed: sql<number>`coalesce(sum(case when ${heartbeatRuns.status} in ('failed','timed_out','cancelled') then 1 else 0 end), 0)::int`,
          avgDurationMs: durationAvgMs,
          totalTokens: tokenSum,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, from),
            lte(heartbeatRuns.createdAt, to),
          ),
        );

      const byAgent = await db
        .select({
          agentId: heartbeatRuns.agentId,
          totalRuns: sql<number>`count(*)::int`,
          succeeded: sql<number>`coalesce(sum(case when ${heartbeatRuns.status} = 'succeeded' then 1 else 0 end), 0)::int`,
          failed: sql<number>`coalesce(sum(case when ${heartbeatRuns.status} in ('failed','timed_out','cancelled') then 1 else 0 end), 0)::int`,
          avgDurationMs: durationAvgMs,
          totalTokens: tokenSum,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, from),
            lte(heartbeatRuns.createdAt, to),
          ),
        )
        .groupBy(heartbeatRuns.agentId);

      const c = companyRow[0] ?? {
        totalRuns: 0,
        succeeded: 0,
        failed: 0,
        avgDurationMs: null as number | null,
        totalTokens: 0n,
      };

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        company: {
          totalRuns: c.totalRuns,
          succeeded: c.succeeded,
          failed: c.failed,
          avgDurationMs: c.avgDurationMs != null ? Math.round(c.avgDurationMs) : null,
          totalTokens: Number(c.totalTokens ?? 0),
        },
        agents: byAgent.map((a) => ({
          agentId: a.agentId,
          totalRuns: a.totalRuns,
          succeeded: a.succeeded,
          failed: a.failed,
          avgDurationMs: a.avgDurationMs != null ? Math.round(a.avgDurationMs) : null,
          totalTokens: Number(a.totalTokens ?? 0),
        })),
      };
    },

    async errorClusters(companyId: string, from: Date, to: Date): Promise<HeartbeatRunErrorCluster[]> {
      const rows = await db
        .select({
          id: heartbeatRuns.id,
          agentId: heartbeatRuns.agentId,
          errorCode: heartbeatRuns.errorCode,
          error: heartbeatRuns.error,
          stderrExcerpt: heartbeatRuns.stderrExcerpt,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, from),
            lte(heartbeatRuns.createdAt, to),
            inArray(heartbeatRuns.status, [...FAILED_STATUSES]),
          ),
        )
        .orderBy(desc(heartbeatRuns.createdAt))
        .limit(8000);

      const map = new Map<
        string,
        {
          errorCode: string | null;
          normalizedMessage: string | null;
          count: number;
          sampleRunIds: string[];
          agentIds: Set<string>;
        }
      >();

      for (const row of rows) {
        const code = row.errorCode?.trim() ? row.errorCode.trim() : null;
        const key = code ? `code:${code}` : `norm:${normalizeRunErrorForCluster(row.error ?? row.stderrExcerpt)}`;
        const normMsg = code ? null : normalizeRunErrorForCluster(row.error ?? row.stderrExcerpt);
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            errorCode: code,
            normalizedMessage: normMsg,
            count: 1,
            sampleRunIds: [row.id],
            agentIds: new Set([row.agentId]),
          });
        } else {
          existing.count += 1;
          if (existing.sampleRunIds.length < 5) existing.sampleRunIds.push(row.id);
          existing.agentIds.add(row.agentId);
        }
      }

      return [...map.entries()]
        .map(([key, v]) => ({
          key,
          errorCode: v.errorCode,
          normalizedMessage: v.normalizedMessage,
          count: v.count,
          sampleRunIds: v.sampleRunIds,
          agentIds: [...v.agentIds],
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 80);
    },
  };
}
