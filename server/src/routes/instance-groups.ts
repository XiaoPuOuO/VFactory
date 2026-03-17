import { Router } from "express";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { instanceGroups } from "@paperclipai/db";
import type { InstancePermissionKey } from "@paperclipai/shared";
import { INSTANCE_PERMISSION_REGISTRY } from "@paperclipai/shared";
import {
  createInstanceGroupSchema,
  updateInstanceGroupSchema,
  setInstanceGroupPermissionsSchema,
  setDefaultGroupSchema,
} from "@paperclipai/shared";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertInstanceSetting } from "./authz.js";
import { instanceGroupsService } from "../services/instance-groups.js";

export function instanceGroupsRoutes(db: Db) {
  const router = Router();
  const svc = instanceGroupsService(db);

  /** 所有 instance groups 路由皆需 admin.setting 或 * */
  router.use((req: Request, _res, next) => {
    assertInstanceSetting(req);
    next();
  });

  router.get("/", async (_req, res) => {
    const list = await svc.list();
    res.json(list);
  });

  /** 回傳權限註冊表，供 Manager 與 UI 列出所有可指派權限。 */
  router.get("/permissions", (_req, res) => {
    const permissions = INSTANCE_PERMISSION_REGISTRY.map((e) => ({
      key: e.key,
      labelKey: e.labelKey,
      ...(e.descriptionKey != null && { descriptionKey: e.descriptionKey }),
      category: e.category,
    }));
    res.json({ permissions });
  });

  router.get("/default-group", async (_req, res) => {
    const defaultGroupName = await svc.getDefaultGroupName();
    res.json({ defaultGroupName });
  });

  router.put("/default-group", validate(setDefaultGroupSchema), async (req, res) => {
    const defaultGroupName = (req.body.defaultGroupName as string).trim().toLowerCase();
    try {
      const name = await svc.setDefaultGroupName(defaultGroupName);
      res.json({ defaultGroupName: name });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("does not exist") || message.includes("cannot be empty")) {
        throw forbidden(message);
      }
      throw err;
    }
  });

  router.get("/:id", async (req, res) => {
    const id = req.params.id as string;
    const group = await svc.getById(id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json(group);
  });

  router.post("/", validate(createInstanceGroupSchema), async (req, res) => {
    const name = (req.body.name as string).trim().toLowerCase();
    const displayName = req.body.displayName as string | undefined;
    const inheritedGroupIds = req.body.inheritedGroupIds as string[] | undefined;
    const existing = await db
      .select({ id: instanceGroups.id })
      .from(instanceGroups)
      .where(eq(instanceGroups.name, name))
      .then((rows) => rows[0] ?? null);
    if (existing) {
      throw forbidden("A group with this name already exists");
    }
    try {
      const group = await svc.create({ name, displayName: displayName ?? null, inheritedGroupIds });
      res.status(201).json(group);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("cycle") || message.includes("inherit from itself")) {
        throw forbidden(message);
      }
      throw err;
    }
  });

  router.patch("/:id", validate(updateInstanceGroupSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    const name = req.body.name as string | undefined;
    const displayName = req.body.displayName as string | null | undefined;
    const inheritedGroupIds = req.body.inheritedGroupIds as string[] | undefined;
    const updates: { name?: string; displayName?: string | null; inheritedGroupIds?: string[] } = {};
    if (name !== undefined) {
      const normalized = name.trim().toLowerCase();
      if (normalized !== existing.name) {
        const duplicate = await db
          .select({ id: instanceGroups.id })
          .from(instanceGroups)
          .where(eq(instanceGroups.name, normalized))
          .then((rows) => rows[0] ?? null);
        if (duplicate) {
          throw forbidden("A group with this name already exists");
        }
      }
      updates.name = normalized;
    }
    if (displayName !== undefined) updates.displayName = displayName;
    if (inheritedGroupIds !== undefined) updates.inheritedGroupIds = inheritedGroupIds;
    try {
      const updated = await svc.update(id, updates);
      if (!updated) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("cycle") || message.includes("inherit from itself")) {
        throw forbidden(message);
      }
      throw err;
    }
  });

  router.delete("/:id", async (req, res) => {
    const id = req.params.id as string;
    try {
      const removed = await svc.remove(id);
      if (!removed) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Cannot delete")) {
        throw forbidden(message);
      }
      throw err;
    }
  });

  router.get("/:id/permissions", async (req, res) => {
    const id = req.params.id as string;
    const group = await svc.getById(id);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json({ permissionKeys: group.permissionKeys });
  });

  router.put("/:id/permissions", validate(setInstanceGroupPermissionsSchema), async (req, res) => {
    const id = req.params.id as string;
    const group = await svc.getById(id);
    if (!group) {
      throw notFound("Group not found");
    }
    const permissionKeys = req.body.permissionKeys as InstancePermissionKey[];
    await svc.setPermissions(id, permissionKeys);
    const updated = await svc.getById(id);
    res.json(updated ?? { ...group, permissionKeys });
  });

  return router;
}
