import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { tenantResolutionMiddleware } from "./middleware/tenant-resolution.js";
import { actorMiddleware } from "./middleware/auth.js";
import { boardMutationGuard } from "./middleware/board-mutation-guard.js";
import { privateHostnameGuard, resolvePrivateHostnameAllowSet } from "./middleware/private-hostname-guard.js";
import { healthRoutes } from "./routes/health.js";
import { tenantCurrentRoutes, tenantsMeRoutes } from "./routes/tenants.js";
import { meRoutes } from "./routes/me.js";
import { chatRoutes } from "./routes/chat.js";
import { chatService, type ChatHeartbeat } from "./services/chat.js";
import { heartbeatService } from "./services/heartbeat.js";
import { companyRoutes } from "./routes/companies.js";
import { issueSavedViewRoutes } from "./routes/issue-saved-views.js";
import { companyWebhookRoutes } from "./routes/company-webhooks.js";
import { companyNotificationDestinationRoutes } from "./routes/company-notification-destinations.js";
import { mentionablesRoutes } from "./routes/mentionables.js";
import { agentRoutes } from "./routes/agents.js";
import { projectRoutes } from "./routes/projects.js";
import { issueRoutes } from "./routes/issues.js";
import { goalRoutes } from "./routes/goals.js";
import { scheduleRoutes } from "./routes/schedules.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { instanceGroupsRoutes } from "./routes/instance-groups.js";
import { instanceUsersRoutes } from "./routes/instance-users.js";
import { instanceSettingsRoutes } from "./routes/instance-settings.js";
import { applyUiBranding } from "./ui-branding.js";
import { registerPluginRuntime } from "./plugins/runtime.js";
import { pluginRoutes } from "./routes/plugins.js";
import { integrationTokenRoutes } from "./routes/integration-tokens.js";
import { scimRoutes } from "./routes/scim.js";
import { scimProvisioningKeyRoutes } from "./routes/scim-provisioning-keys.js";
import { scimBearerAuthMiddleware } from "./middleware/scim-auth.js";
import type { BetterAuthSessionResult } from "./auth/better-auth.js";
import type { GetBanStatusFn } from "./middleware/auth.js";

type UiMode = "none" | "static" | "vite-dev";

export type HttpServer = import("node:http").Server;

export async function createApp(
  db: Db,
  opts: {
    uiMode: UiMode;
    serverPort: number;
    /** 若為 vite-dev 且提供此 server，HMR WebSocket 將走同一埠，不再另開 serverPort+10000 */
    httpServer?: HttpServer | null;
    storageService: StorageService;
    deploymentMode: DeploymentMode;
    deploymentExposure: DeploymentExposure;
    allowedHostnames: string[];
    bindHost: string;
    authReady: boolean;
    companyDeletionEnabled: boolean;
    betterAuthHandler?: express.RequestHandler;
    resolveSession?: (req: ExpressRequest) => Promise<BetterAuthSessionResult | null>;
    /** 查詢使用者封禁狀態（authenticated 模式下封禁者無法登入） */
    getBanStatus?: GetBanStatusFn;
    /** 可用登入方式（供 UI 顯示／隱藏對應按鈕） */
    authProviders?: { emailPassword?: boolean; google?: boolean };
  },
) {
  const app = express();

  app.use(httpLogger);
  const privateHostnameGateEnabled =
    opts.deploymentMode === "authenticated" && opts.deploymentExposure === "private";
  const privateHostnameAllowSet = resolvePrivateHostnameAllowSet({
    allowedHostnames: opts.allowedHostnames,
    bindHost: opts.bindHost,
  });
  app.use(
    privateHostnameGuard({
      enabled: privateHostnameGateEnabled,
      allowedHostnames: opts.allowedHostnames,
      bindHost: opts.bindHost,
    }),
  );
  app.use(tenantResolutionMiddleware(db, { defaultTenantSlug: "default" }));
  app.use(
    actorMiddleware(db, {
      deploymentMode: opts.deploymentMode,
      resolveSession: opts.resolveSession,
      getBanStatus: opts.getBanStatus,
    }),
  );
  app.get("/api/auth/get-session", (req, res) => {
    if (req.actor.type === "banned") {
      res.status(403).json({
        error: "Account banned",
        reason: req.actor.reason ?? "Your account has been suspended.",
        bannedUntil: req.actor.bannedUntil?.toISOString() ?? null,
      });
      return;
    }
    if (req.actor.type !== "board" || !req.actor.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      session: {
        id: `paperclip:${req.actor.source}:${req.actor.userId}`,
        userId: req.actor.userId,
      },
      user: {
        id: req.actor.userId,
        email: null,
        name: req.actor.source === "local_implicit" ? "Local Board" : null,
      },
    });
  });
  app.get("/api/auth/providers", (_req, res) => {
    const providers = opts.authProviders ?? {};
    res.json({
      emailPassword: providers.emailPassword !== false,
      google: providers.google === true,
    });
  });
  if (opts.betterAuthHandler) {
    app.all(/^\/api\/auth\/.+/, opts.betterAuthHandler);
  }

  app.use(express.json());
  app.use("/api/scim/v2", scimBearerAuthMiddleware(db), scimRoutes(db));
  app.use(llmRoutes(db));

  // Mount API routes
  const api = Router();
  api.use(boardMutationGuard());
  api.use("/tenant", tenantCurrentRoutes(db));
  api.use("/tenants/me", tenantsMeRoutes(db));
  api.use("/me", meRoutes(db));
  api.use(
    "/health",
    healthRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      authReady: opts.authReady,
      companyDeletionEnabled: opts.companyDeletionEnabled,
    }),
  );
  registerPluginRuntime(db);
  const heartbeat = heartbeatService(db);
  const chat = chatService(db, heartbeat as ChatHeartbeat);
  api.use("/companies", chatRoutes(db, chat));
  api.use("/companies", pluginRoutes(db));
  api.use("/companies", integrationTokenRoutes(db));
  api.use("/companies", companyRoutes(db));
  api.use("/companies", issueSavedViewRoutes(db));
  api.use("/companies", companyWebhookRoutes(db));
  api.use("/companies", companyNotificationDestinationRoutes(db));
  api.use("/companies", mentionablesRoutes(db));
  api.use(agentRoutes(db));
  api.use(assetRoutes(db, opts.storageService));
  api.use(projectRoutes(db));
  api.use(issueRoutes(db, opts.storageService, chat));
  api.use(goalRoutes(db));
  api.use(scheduleRoutes(db));
  api.use(approvalRoutes(db));
  api.use(secretRoutes(db));
  api.use(costRoutes(db));
  api.use(activityRoutes(db));
  api.use(dashboardRoutes(db));
  api.use(sidebarBadgeRoutes(db));
  api.use(
    accessRoutes(db, {
      deploymentMode: opts.deploymentMode,
      deploymentExposure: opts.deploymentExposure,
      bindHost: opts.bindHost,
      allowedHostnames: opts.allowedHostnames,
    }),
  );
  api.use("/instance/groups", instanceGroupsRoutes(db));
  api.use("/instance/users", instanceUsersRoutes(db));
  api.use("/instance/settings", instanceSettingsRoutes(db));
  api.use("/instance/scim-provisioning-keys", scimProvisioningKeyRoutes(db));
  app.use("/api", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (opts.uiMode === "static") {
    // Try published location first (server/ui-dist/), then monorepo dev location (../../ui/dist)
    const candidates = [
      path.resolve(__dirname, "../ui-dist"),
      path.resolve(__dirname, "../../ui/dist"),
    ];
    const uiDist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
    if (uiDist) {
      const indexHtml = applyUiBranding(fs.readFileSync(path.join(uiDist, "index.html"), "utf-8"));
      app.use(express.static(uiDist));
      app.get(/.*/, (_req, res) => {
        res.status(200).set("Content-Type", "text/html").end(indexHtml);
      });
    } else {
      console.warn("[paperclip] UI dist not found; running in API-only mode");
    }
  }

  if (opts.uiMode === "vite-dev") {
    const uiRoot = path.resolve(__dirname, "../../ui");
    const { createServer: createViteServer } = await import("vite");
    /** HMR 使用同一 HTTP server，避免另開 13100 等埠導致連線失敗 */
    const hmrOpts = opts.httpServer
      ? { server: opts.httpServer }
      : {
          host: opts.bindHost,
          port: opts.serverPort + 10000,
          clientPort: opts.serverPort + 10000,
        };
    const vite = await createViteServer({
      root: uiRoot,
      appType: "spa",
      server: {
        middlewareMode: true,
        hmr: hmrOpts,
        allowedHosts: privateHostnameGateEnabled ? Array.from(privateHostnameAllowSet) : undefined,
      },
    });

    app.use(vite.middlewares);
    app.get(/.*/, async (req, res, next) => {
      try {
        const templatePath = path.resolve(uiRoot, "index.html");
        const template = fs.readFileSync(templatePath, "utf-8");
        const html = applyUiBranding(await vite.transformIndexHtml(req.originalUrl, template));
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  }

  app.use(errorHandler);

  return app;
}
