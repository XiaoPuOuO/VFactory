import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createProjectSchema,
  createProjectWorkspaceSchema,
  isUuidLike,
  updateProjectSchema,
  updateProjectWorkspaceSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { projectService, logActivity } from "../services/index.js";
import { conflict } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { assertCompanyPermission } from "./company-permission.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";

export function projectRoutes(db: Db) {
  const router = Router();
  const svc = projectService(db);

  async function resolveCompanyIdForProjectReference(req: Request) {
    const companyIdQuery = req.query.companyId;
    const requestedCompanyId =
      typeof companyIdQuery === "string" && companyIdQuery.trim().length > 0
        ? companyIdQuery.trim()
        : null;
    if (requestedCompanyId) {
      await assertCompanyAccess(req, requestedCompanyId, db);
      return requestedCompanyId;
    }
    if (req.actor.type === "agent" && req.actor.companyId) {
      return req.actor.companyId;
    }
    if (req.actor.type === "service" && req.actor.companyId) {
      return req.actor.companyId;
    }
    return null;
  }

  async function normalizeProjectReference(req: Request, rawId: string) {
    if (isUuidLike(rawId)) return rawId;
    const companyId = await resolveCompanyIdForProjectReference(req);
    if (!companyId) return rawId;
    const resolved = await svc.resolveByReference(companyId, rawId);
    if (resolved.ambiguous) {
      throw conflict("Project shortname is ambiguous in this company. Use the project ID.");
    }
    return resolved.project?.id ?? rawId;
  }

  router.param("id", async (req, _res, next, rawId) => {
    try {
      req.params.id = await normalizeProjectReference(req, rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/projects", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "projects:read");
    const result = await svc.list(companyId);
    res.json(result);
  });

  router.get("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const project = await svc.getById(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, project.companyId, "projects:read");
    res.json(project);
  });

  router.post("/companies/:companyId/projects", validate(createProjectSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot create projects" });
      return;
    }
    if (req.actor.type === "agent") {
      await assertCompanyPermission(db, req, companyId, "projects:manage");
    }
    type CreateProjectPayload = Parameters<typeof svc.create>[1] & {
      workspace?: Parameters<typeof svc.createWorkspace>[1];
    };

    const { workspace, ...projectData } = req.body as CreateProjectPayload;
    const project = await svc.create(companyId, projectData);
    let createdWorkspaceId: string | null = null;
    if (workspace) {
      const createdWorkspace = await svc.createWorkspace(project.id, workspace);
      if (!createdWorkspace) {
        await svc.remove(project.id);
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }
      createdWorkspaceId = createdWorkspace.id;
    }
    const hydratedProject = workspace ? await svc.getById(project.id) : project;

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.created",
      entityType: "project",
      entityId: project.id,
      details: {
        name: project.name,
        workspaceId: createdWorkspaceId,
      },
    });
    res.status(201).json(hydratedProject ?? project);
  });

  router.patch("/projects/:id", validate(updateProjectSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "agent") {
      await assertCompanyPermission(db, req, existing.companyId, "projects:manage");
    }
    const project = await svc.update(id, req.body);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.updated",
      entityType: "project",
      entityId: project.id,
      details: req.body,
    });

    res.json(project);
  });

  router.get("/projects/:id/workspaces", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, existing.companyId, "projects:read");
    const workspaces = await svc.listWorkspaces(id);
    res.json(workspaces);
  });

  router.post("/projects/:id/workspaces", validate(createProjectWorkspaceSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot create workspaces" });
      return;
    }
    if (req.actor.type === "agent") {
      await assertCompanyPermission(db, req, existing.companyId, "projects:manage");
    }
    const workspace = await svc.createWorkspace(id, req.body);
    if (!workspace) {
      res.status(422).json({ error: "Invalid project workspace payload" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_created",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
        cwd: workspace.cwd,
        isPrimary: workspace.isPrimary,
      },
    });

    res.status(201).json(workspace);
  });

  router.patch(
    "/projects/:id/workspaces/:workspaceId",
    validate(updateProjectWorkspaceSchema),
    async (req, res) => {
      const id = req.params.id as string;
      const workspaceId = req.params.workspaceId as string;
      const existing = await svc.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      await assertCompanyAccess(req, existing.companyId, db);
      if (req.actor.type === "service") {
        res.status(403).json({ error: "Integration token cannot update workspaces" });
        return;
      }
      if (req.actor.type === "agent") {
        await assertCompanyPermission(db, req, existing.companyId, "projects:manage");
      }
      const workspaceExists = (await svc.listWorkspaces(id)).some((workspace) => workspace.id === workspaceId);
      if (!workspaceExists) {
        res.status(404).json({ error: "Project workspace not found" });
        return;
      }
      const workspace = await svc.updateWorkspace(id, workspaceId, req.body);
      if (!workspace) {
        res.status(422).json({ error: "Invalid project workspace payload" });
        return;
      }

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: existing.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "project.workspace_updated",
        entityType: "project",
        entityId: id,
        details: {
          workspaceId: workspace.id,
          changedKeys: Object.keys(req.body).sort(),
        },
      });

      res.json(workspace);
    },
  );

  router.delete("/projects/:id/workspaces/:workspaceId", async (req, res) => {
    const id = req.params.id as string;
    const workspaceId = req.params.workspaceId as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete workspaces" });
      return;
    }
    if (req.actor.type === "agent") {
      await assertCompanyPermission(db, req, existing.companyId, "projects:manage");
    }
    const workspace = await svc.removeWorkspace(id, workspaceId);
    if (!workspace) {
      res.status(404).json({ error: "Project workspace not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.workspace_deleted",
      entityType: "project",
      entityId: id,
      details: {
        workspaceId: workspace.id,
        name: workspace.name,
      },
    });

    res.json(workspace);
  });

  router.delete("/projects/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete projects" });
      return;
    }
    if (req.actor.type === "agent") {
      await assertCompanyPermission(db, req, existing.companyId, "projects:manage");
    }
    const project = await svc.remove(id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: project.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "project.deleted",
      entityType: "project",
      entityId: project.id,
    });

    res.json(project);
  });

  return router;
}
