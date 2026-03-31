import express, { Router, type Request as ExpressRequest } from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import type { StorageService } from "./storage/types.js";
import { httpLogger, errorHandler } from "./middleware/index.js";
import { csrfSessionGuard } from "./middleware/csrf-session-guard.js";
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
import { companySkillRoutes } from "./routes/company-skills.js";
import { workflowRunRoutes } from "./routes/workflow-runs.js";
import { approvalRoutes } from "./routes/approvals.js";
import { secretRoutes } from "./routes/secrets.js";
import { costRoutes } from "./routes/costs.js";
import { activityRoutes } from "./routes/activity.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { sidebarBadgeRoutes } from "./routes/sidebar-badges.js";
import { llmRoutes } from "./routes/llms.js";
import { assetRoutes } from "./routes/assets.js";
import { accessRoutes } from "./routes/access.js";
import { browserUseToolRoutes } from "./routes/browser-use-tools.js";
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
import { createOpenApiDocument, registerOpenApiEndpoints } from "./openapi/index.js";
import { requireOpenApiAdminGroup } from "./middleware/openapi-admin-guard.js";
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
  const openApiTargets: Array<{ mountPath: string; router: Router }> = [];
  api.use(boardMutationGuard());
  api.use(csrfSessionGuard());
  const tenantRouter = tenantCurrentRoutes(db);
  openApiTargets.push({ mountPath: "/tenant", router: tenantRouter });
  api.use("/tenant", tenantRouter);

  const tenantsMeRouter = tenantsMeRoutes(db);
  openApiTargets.push({ mountPath: "/tenants/me", router: tenantsMeRouter });
  api.use("/tenants/me", tenantsMeRouter);

  const meRouter = meRoutes(db);
  openApiTargets.push({ mountPath: "/me", router: meRouter });
  api.use("/me", meRouter);

  const healthRouter = healthRoutes(db, {
    deploymentMode: opts.deploymentMode,
    deploymentExposure: opts.deploymentExposure,
    authReady: opts.authReady,
    companyDeletionEnabled: opts.companyDeletionEnabled,
  });
  openApiTargets.push({ mountPath: "/health", router: healthRouter });
  api.use("/health", healthRouter);

  registerPluginRuntime(db);
  const heartbeat = heartbeatService(db, opts.storageService);
  const chat = chatService(db, heartbeat as ChatHeartbeat, opts.storageService);

  const companiesChatRouter = chatRoutes(db, chat);
  openApiTargets.push({ mountPath: "/companies", router: companiesChatRouter });
  api.use("/companies", companiesChatRouter);

  const companiesPluginRouter = pluginRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesPluginRouter });
  api.use("/companies", companiesPluginRouter);

  const companiesIntegrationTokenRouter = integrationTokenRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesIntegrationTokenRouter });
  api.use("/companies", companiesIntegrationTokenRouter);

  const companiesCompanyRouter = companyRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesCompanyRouter });
  api.use("/companies", companiesCompanyRouter);

  const companiesIssueSavedViewRouter = issueSavedViewRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesIssueSavedViewRouter });
  api.use("/companies", companiesIssueSavedViewRouter);

  const companiesWebhookRouter = companyWebhookRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesWebhookRouter });
  api.use("/companies", companiesWebhookRouter);

  const companiesNotificationDestinationRouter = companyNotificationDestinationRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesNotificationDestinationRouter });
  api.use("/companies", companiesNotificationDestinationRouter);

  const companiesMentionablesRouter = mentionablesRoutes(db);
  openApiTargets.push({ mountPath: "/companies", router: companiesMentionablesRouter });
  api.use("/companies", companiesMentionablesRouter);

  const agentRouter = agentRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: agentRouter });
  api.use(agentRouter);

  const browserUseToolRouter = browserUseToolRoutes(db);
  openApiTargets.push({ mountPath: "", router: browserUseToolRouter });
  api.use(browserUseToolRouter);

  const assetRouter = assetRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: assetRouter });
  api.use(assetRouter);

  const projectRouter = projectRoutes(db);
  openApiTargets.push({ mountPath: "", router: projectRouter });
  api.use(projectRouter);

  const issueRouter = issueRoutes(db, opts.storageService, chat);
  openApiTargets.push({ mountPath: "", router: issueRouter });
  api.use(issueRouter);

  const goalRouter = goalRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: goalRouter });
  api.use(goalRouter);

  const scheduleRouter = scheduleRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: scheduleRouter });
  api.use(scheduleRouter);

  const companySkillRouter = companySkillRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: companySkillRouter });
  api.use(companySkillRouter);

  const workflowRunRouter = workflowRunRoutes(db, opts.storageService, heartbeat as ChatHeartbeat);
  openApiTargets.push({ mountPath: "", router: workflowRunRouter });
  api.use(workflowRunRouter);

  const approvalRouter = approvalRoutes(db, opts.storageService);
  openApiTargets.push({ mountPath: "", router: approvalRouter });
  api.use(approvalRouter);

  const secretRouter = secretRoutes(db);
  openApiTargets.push({ mountPath: "", router: secretRouter });
  api.use(secretRouter);

  const costRouter = costRoutes(db);
  openApiTargets.push({ mountPath: "", router: costRouter });
  api.use(costRouter);

  const activityRouter = activityRoutes(db);
  openApiTargets.push({ mountPath: "", router: activityRouter });
  api.use(activityRouter);

  const dashboardRouter = dashboardRoutes(db);
  openApiTargets.push({ mountPath: "", router: dashboardRouter });
  api.use(dashboardRouter);

  const sidebarBadgeRouter = sidebarBadgeRoutes(db);
  openApiTargets.push({ mountPath: "", router: sidebarBadgeRouter });
  api.use(sidebarBadgeRouter);

  const accessRouter = accessRoutes(db, {
    deploymentMode: opts.deploymentMode,
    deploymentExposure: opts.deploymentExposure,
    bindHost: opts.bindHost,
    allowedHostnames: opts.allowedHostnames,
  });
  openApiTargets.push({ mountPath: "", router: accessRouter });
  api.use(accessRouter);

  const instanceGroupsRouter = instanceGroupsRoutes(db);
  openApiTargets.push({ mountPath: "/instance/groups", router: instanceGroupsRouter });
  api.use("/instance/groups", instanceGroupsRouter);

  const instanceUsersRouter = instanceUsersRoutes(db);
  openApiTargets.push({ mountPath: "/instance/users", router: instanceUsersRouter });
  api.use("/instance/users", instanceUsersRouter);

  const instanceSettingsRouter = instanceSettingsRoutes(db);
  openApiTargets.push({ mountPath: "/instance/settings", router: instanceSettingsRouter });
  api.use("/instance/settings", instanceSettingsRouter);

  const scimProvisioningKeyRouter = scimProvisioningKeyRoutes(db);
  openApiTargets.push({ mountPath: "/instance/scim-provisioning-keys", router: scimProvisioningKeyRouter });
  api.use("/instance/scim-provisioning-keys", scimProvisioningKeyRouter);

  app.use("/api", api);

  // 由目前 Express route stack 自動產生 OpenAPI 規格，提供外部整合使用。
  // 這裡在註冊 `/api/openapi.json` 與 `/api/docs` 之前產生，避免文件遞迴。
  const openApiDoc = createOpenApiDocument(openApiTargets, { apiPrefix: "/api" });
  const openApiAdminRouter = Router();
  openApiAdminRouter.use(requireOpenApiAdminGroup(db));
  registerOpenApiEndpoints(openApiAdminRouter, openApiDoc);
  api.use(openApiAdminRouter);
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
    const hmrClientPortRaw = process.env.VITE_HMR_CLIENT_PORT?.trim();
    let hmrClientPort: number | undefined;
    if (hmrClientPortRaw) {
      const n = Number(hmrClientPortRaw);
      if (!Number.isNaN(n) && n > 0) {
        hmrClientPort = n;
      }
    }

    const clientFacingPort = hmrClientPort ?? opts.serverPort;

    const hmrOpts = opts.httpServer
      ? {
          server: opts.httpServer,
          /** 與 HTTP 同一 process；避免客戶端以為是獨立 5173 服務 */
          port: opts.serverPort,
          clientPort: clientFacingPort,
        }
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
        /** 覆寫 vite.config 內可能殘留的預設 5173，讓 HMR 與實際 listen 埠一致 */
        port: opts.serverPort,
        strictPort: false,
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
