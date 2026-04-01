import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { roadmapHumanOverrides, roadmapVersions } from "@paperclipai/db";
import { createHash } from "node:crypto";
import { issueService } from "./issues.js";

const MAX_ROADMAP_MATERIALIZE_ITEMS = 50;

export function roadmapService(db: Db) {
  return {
    async listVersions(companyId: string) {
      return db
        .select()
        .from(roadmapVersions)
        .where(eq(roadmapVersions.companyId, companyId))
        .orderBy(desc(roadmapVersions.version));
    },

    async createVersion(
      companyId: string,
      args: {
        title: string;
        contentMarkdown: string;
        createdByUserId?: string | null;
      },
    ) {
      const [maxRow] = await db
        .select({ v: roadmapVersions.version })
        .from(roadmapVersions)
        .where(eq(roadmapVersions.companyId, companyId))
        .orderBy(desc(roadmapVersions.version))
        .limit(1);
      const nextVersion = (maxRow?.v ?? 0) + 1;
      const [row] = await db
        .insert(roadmapVersions)
        .values({
          companyId,
          version: nextVersion,
          title: args.title,
          contentMarkdown: args.contentMarkdown,
          createdByUserId: args.createdByUserId ?? null,
        })
        .returning();
      return row ?? null;
    },

    async listOverrides(companyId: string, status?: string) {
      const conditions = [eq(roadmapHumanOverrides.companyId, companyId)];
      if (status) {
        conditions.push(eq(roadmapHumanOverrides.status, status));
      }
      return db
        .select()
        .from(roadmapHumanOverrides)
        .where(and(...conditions))
        .orderBy(desc(roadmapHumanOverrides.createdAt));
    },

    async createOverride(
      companyId: string,
      args: {
        patchJson: unknown[];
        createdByUserId?: string | null;
      },
    ) {
      const raw = JSON.stringify(args.patchJson);
      const previewHash = createHash("sha256").update(raw, "utf8").digest("hex");
      const [row] = await db
        .insert(roadmapHumanOverrides)
        .values({
          companyId,
          status: "pending",
          patchJson: args.patchJson,
          previewHash,
          createdByUserId: args.createdByUserId ?? null,
        })
        .returning();
      return row ?? null;
    },

    async applyOverride(overrideId: string, companyId: string, appliedByUserId: string) {
      const [updated] = await db
        .update(roadmapHumanOverrides)
        .set({
          status: "applied",
          appliedAt: new Date(),
          appliedByUserId,
        })
        .where(
          and(
            eq(roadmapHumanOverrides.id, overrideId),
            eq(roadmapHumanOverrides.companyId, companyId),
            eq(roadmapHumanOverrides.status, "pending"),
          ),
        )
        .returning();
      return updated ?? null;
    },

    /**
     * 將 roadmap 版本中 Markdown 清單列（`-` / `*`）轉成 backlog Issues（最多 MAX_ROADMAP_MATERIALIZE_ITEMS）。
     */
    async materializeVersionToIssues(companyId: string, versionId: string) {
      const row = await db
        .select()
        .from(roadmapVersions)
        .where(and(eq(roadmapVersions.id, versionId), eq(roadmapVersions.companyId, companyId)))
        .limit(1)
        .then((rows) => rows[0] ?? null);
      if (!row) return null;

      const lines = row.contentMarkdown.split(/\r?\n/);
      const titles: string[] = [];
      for (const line of lines) {
        const m = line.match(/^\s*[-*]\s+(.+)$/);
        const raw = m?.[1]?.trim();
        if (raw && raw.length > 0) {
          titles.push(raw.slice(0, 500));
        }
      }
      const capped = titles.slice(0, MAX_ROADMAP_MATERIALIZE_ITEMS);
      const issuesApi = issueService(db);
      const created: { id: string; identifier: string | null }[] = [];
      for (const title of capped) {
        const issue = await issuesApi.create(companyId, {
          title: `[Roadmap v${row.version}] ${title}`,
          description: `由 roadmap 版本 ${row.version}（${row.id}）匯入。`,
          status: "backlog",
          priority: "medium",
        });
        created.push({ id: issue.id, identifier: issue.identifier ?? null });
      }
      return { version: row.version, roadmapVersionId: row.id, created };
    },
  };
}
