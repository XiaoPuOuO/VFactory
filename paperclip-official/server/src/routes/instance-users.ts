import { Router } from "express";
import type { Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  banInstanceUserSchema,
  setInstanceUserGroupSchema,
  updateInstanceUserNameSchema,
} from "@paperclipai/shared";
import { forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertInstanceSetting } from "./authz.js";
import { accessService } from "../services/access.js";
import { instanceGroupsService } from "../services/instance-groups.js";

export function instanceUsersRoutes(db: Db) {
  const router = Router();
  const access = accessService(db);
  const groupsSvc = instanceGroupsService(db);

  /** 所有 instance users 路由皆需 admin.setting 或 * */
  router.use((req: Request, _res, next) => {
    assertInstanceSetting(req);
    next();
  });

  router.get("/", async (_req, res) => {
    const users = await access.listBoardUsers();
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image ?? null,
        group: u.group ?? null,
        createdAt: u.createdAt.toISOString(),
        bannedAt: u.bannedAt?.toISOString() ?? null,
        bannedUntil: u.bannedUntil?.toISOString() ?? null,
        banReason: u.banReason ?? null,
      })),
    );
  });

  router.patch("/:userId/group", validate(setInstanceUserGroupSchema), async (req, res) => {
    const userId = req.params.userId as string;
    const group = req.body.group as string | null;

    const users = await access.listBoardUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw notFound("User not found");
    }

    if (group != null && group.trim() !== "") {
      const groupNames = (await groupsSvc.list()).map((g) => g.name);
      if (!groupNames.includes(group.trim())) {
        throw forbidden("Group does not exist");
      }
      await access.setUserGroup(userId, group.trim());
      res.json({ userId, group: group.trim() });
    } else {
      await access.setUserGroup(userId, null);
      res.json({ userId, group: null });
    }
  });

  router.patch("/:userId/name", validate(updateInstanceUserNameSchema), async (req, res) => {
    const userId = req.params.userId as string;
    const name = req.body.name as string;

    const users = await access.listBoardUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw notFound("User not found");
    }
    await access.updateUserName(userId, name);
    res.json({ userId, name });
  });

  router.post("/:userId/ban", validate(banInstanceUserSchema), async (req, res) => {
    const userId = req.params.userId as string;
    const { reason, durationSeconds } = req.body as { reason: string; durationSeconds: number | null };

    const users = await access.listBoardUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw notFound("User not found");
    }
    await access.banUser(userId, { reason, durationSeconds });
    res.json({ userId, banned: true });
  });

  router.post("/:userId/unban", async (req, res) => {
    const userId = req.params.userId as string;

    const users = await access.listBoardUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw notFound("User not found");
    }
    await access.unbanUser(userId);
    res.json({ userId, banned: false });
  });

  router.delete("/:userId", async (req, res) => {
    const userId = req.params.userId as string;

    const users = await access.listBoardUsers();
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw notFound("User not found");
    }
    await access.deleteUser(userId);
    res.status(204).send();
  });

  return router;
}
