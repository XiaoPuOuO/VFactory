import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { builtinPluginIdSchema, upsertCompanyPluginSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { companyPluginService, logActivity } from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { listRegisteredPlugins } from "../plugins/registry.js";

export function pluginRoutes(db: Db) {
  const router = Router();
  const svc = companyPluginService(db);

  router.get("/:companyId/plugins", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    const rows = await svc.listRows(companyId);
    const rowMap = new Map(rows.map((r) => [r.pluginId, r]));
    const catalog = listRegisteredPlugins();
    const plugins = catalog.map((p) => {
      const row = rowMap.get(p.id);
      return {
        id: p.id,
        label: p.label,
        description: p.description,
        enabled: row?.enabled ?? false,
        config: row?.config ?? {},
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });
    res.json({ plugins });
  });

  router.patch(
    "/:companyId/plugins/:pluginId",
    validate(upsertCompanyPluginSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      await assertCompanyPermission(db, req, companyId, "company:manage");
      const pluginId = req.params.pluginId as string;
      const parsed = builtinPluginIdSchema.safeParse(pluginId);
      if (!parsed.success) {
        res.status(400).json({ error: "Unknown plugin id" });
        return;
      }
      const mod = listRegisteredPlugins().find((p) => p.id === pluginId);
      if (!mod) {
        res.status(400).json({ error: "Unknown plugin id" });
        return;
      }
      const row = await svc.upsert(companyId, pluginId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.plugin.updated",
        entityType: "company_plugin",
        entityId: row.id,
        details: { pluginId, enabled: row.enabled },
      });
      res.json({
        id: row.pluginId,
        label: mod.label,
        description: mod.description,
        enabled: row.enabled,
        config: row.config,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  );

  return router;
}
