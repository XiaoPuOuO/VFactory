---
title: Built-in company plugins
summary: Registering compile-time plugins that subscribe to live events (non-adapter)
---

Paperclip separates **agent adapters** (how a heartbeat invokes a runtime) from **company plugins** (optional in-process extensions that react to the same live-event stream used for SSE).

Plugins are **compile-time registered** in the server. The database stores per-company enablement and JSON `config` only—there is no execution of user-supplied code from the DB.

## Architecture

1. **Registry** — [`server/src/plugins/registry.ts`](../../server/src/plugins/registry.ts) exports `listRegisteredPlugins()` and `getServerPlugin(id)`.
2. **Runtime** — [`server/src/plugins/runtime.ts`](../../server/src/plugins/runtime.ts) installs a post-publish hook on [`publishLiveEvent`](../../server/src/services/live-events.ts). For each enabled row in `company_plugins`, the matching module’s `onLiveEvent` runs. Errors are logged and do not fail the original HTTP request.
3. **API** — Board users can list plugins with `GET /api/companies/{companyId}/plugins`. Updating requires `company:manage` permission: `PATCH /api/companies/{companyId}/plugins/{pluginId}` with `{ "enabled": true }` and/or `{ "config": { ... } }`.
4. **Shared constants** — Valid `pluginId` values are listed in `BUILTIN_PLUGIN_IDS` in [`packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts). Add new ids there and validate with Zod (`builtinPluginIdSchema`).

## Adding a new built-in plugin

1. Add the id to `BUILTIN_PLUGIN_IDS` in `packages/shared`.
2. Implement `ServerPluginModule` in `server/src/plugins/registry.ts` (import side effects only from trusted code).
3. Register the module in the `pluginsById` map.
4. Run `pnpm db:generate` only if the schema changes (usually not for a new plugin id).
5. Add UI strings under `company.pluginLabel_{{id}}` / `company.pluginDesc_{{id}}` in `ui/src/locales/*.json` (optional; API falls back to `label`/`description` from the registry).

## Event contract

Handlers receive `LiveEvent` (see `packages/shared` `LiveEvent` / `LIVE_EVENT_TYPES`), including `activity.logged` after mutations that call `logActivity`. Keep `onLiveEvent` fast; push heavy work to a queue in future iterations if needed.

## Security

- Treat `config` as sensitive: avoid logging full JSON at info level.
- Do not store secrets in activity log details for plugin updates (the API logs `pluginId` and `enabled` only).
