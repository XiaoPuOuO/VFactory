import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyPlugins } from "@paperclipai/db";

export function companyPluginService(db: Db) {
  return {
    async listRows(companyId: string) {
      return db.select().from(companyPlugins).where(eq(companyPlugins.companyId, companyId));
    },

    /** 供 plugin runtime：僅啟用列，含 config。 */
    async listEnabledWithConfig(companyId: string) {
      return db
        .select({
          pluginId: companyPlugins.pluginId,
          config: companyPlugins.config,
        })
        .from(companyPlugins)
        .where(and(eq(companyPlugins.companyId, companyId), eq(companyPlugins.enabled, true)));
    },

    async upsert(
      companyId: string,
      pluginId: string,
      patch: { enabled?: boolean; config?: Record<string, unknown> },
    ) {
      const existing = await db
        .select()
        .from(companyPlugins)
        .where(and(eq(companyPlugins.companyId, companyId), eq(companyPlugins.pluginId, pluginId)))
        .then((rows) => rows[0] ?? null);

      const now = new Date();
      const enabled = patch.enabled !== undefined ? patch.enabled : (existing?.enabled ?? false);
      const config = patch.config !== undefined ? patch.config : (existing?.config ?? {});

      if (existing) {
        const [row] = await db
          .update(companyPlugins)
          .set({ enabled, config, updatedAt: now })
          .where(eq(companyPlugins.id, existing.id))
          .returning();
        return row;
      }

      const [row] = await db
        .insert(companyPlugins)
        .values({
          companyId,
          pluginId,
          enabled,
          config,
          updatedAt: now,
        })
        .returning();
      return row;
    },
  };
}
