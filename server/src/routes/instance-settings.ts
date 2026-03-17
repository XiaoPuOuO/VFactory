import { Router } from "express";
import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertInstanceSetting } from "./authz.js";
import { instanceSettingsService } from "../services/instance-settings.js";
import { setDefaultCompanyPathSchema } from "@paperclipai/shared";

/**
 * 此站設定 API：預設公司路徑等。
 * 所有路由皆需 admin.setting 或 *。
 */
export function instanceSettingsRoutes(db: Db) {
  const router = Router();
  const svc = instanceSettingsService(db);

  router.use((req: Request, _res, next) => {
    assertInstanceSetting(req);
    next();
  });

  router.get("/default-company-path", async (_req, res) => {
    const path = await svc.getDefaultCompanyPath();
    res.json({ defaultCompanyPath: path ?? "" });
  });

  router.put("/default-company-path", validate(setDefaultCompanyPathSchema), async (req, res) => {
    const value = (req.body.defaultCompanyPath as string).trim();
    const result = await svc.setDefaultCompanyPath(value);
    res.json({ defaultCompanyPath: result ?? "" });
  });

  return router;
}
