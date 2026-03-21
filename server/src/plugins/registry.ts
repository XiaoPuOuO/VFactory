import type { Db } from "@paperclipai/db";
import type { LiveEvent } from "@paperclipai/shared";

export interface ServerPluginContext {
  db: Db;
  companyId: string;
  pluginId: string;
  config: Record<string, unknown>;
  event: LiveEvent;
}

export interface ServerPluginModule {
  id: string;
  /** 內建字串（API 回傳；UI 可覆寫為 i18n）。 */
  label: string;
  description: string;
  onLiveEvent?(ctx: ServerPluginContext): Promise<void>;
}

const noopPlugin: ServerPluginModule = {
  id: "noop",
  label: "No-op",
  description: "Built-in placeholder plugin. Subscribes to live events when enabled; performs no side effects.",
  async onLiveEvent() {
    // Intentionally empty — validates plugin pipeline without outbound I/O.
  },
};

const pluginsById = new Map<string, ServerPluginModule>([[noopPlugin.id, noopPlugin]]);

export function getServerPlugin(id: string): ServerPluginModule | undefined {
  return pluginsById.get(id);
}

export function listRegisteredPlugins(): ServerPluginModule[] {
  return [...pluginsById.values()];
}
