import type { Db } from "@paperclipai/db";
import type { LiveEvent } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";
import { companyPluginService } from "../services/company-plugins.js";
import { setLiveEventPostPublishHook } from "../services/live-events.js";
import { getServerPlugin } from "./registry.js";

export function registerPluginRuntime(db: Db) {
  const svc = companyPluginService(db);

  setLiveEventPostPublishHook((event: LiveEvent) => {
    void dispatchLiveEvent(db, svc, event).catch((err) => {
      logger.error({ err, companyId: event.companyId }, "plugin runtime dispatch failed");
    });
  });
}

async function dispatchLiveEvent(
  db: Db,
  svc: ReturnType<typeof companyPluginService>,
  event: LiveEvent,
) {
  const rows = await svc.listEnabledWithConfig(event.companyId);
  for (const row of rows) {
    const mod = getServerPlugin(row.pluginId);
    if (!mod?.onLiveEvent) continue;
    try {
      await mod.onLiveEvent({
        db,
        companyId: event.companyId,
        pluginId: row.pluginId,
        config: row.config,
        event,
      });
    } catch (err) {
      logger.warn(
        { err, companyId: event.companyId, pluginId: row.pluginId },
        "plugin onLiveEvent threw",
      );
    }
  }
}
