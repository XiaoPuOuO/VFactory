import { Router, type Request, type Response } from "express";
import multer from "multer";
import type { Db } from "@paperclipai/db";
import {
  addIssueCommentSchema,
  createIssueAttachmentMetadataSchema,
  createIssueLabelSchema,
  checkoutIssueSchema,
  createIssueSchema,
  linkIssueApprovalSchema,
  updateIssueSchema,
} from "@paperclipai/shared";
import type { StorageService } from "../storage/types.js";
import { validate } from "../middleware/validate.js";
import {
  accessService,
  agentService,
  goalService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  notifyIssueCommentCreated,
  projectService,
  scheduleCompanyNotificationEvent,
} from "../services/index.js";
import { logger } from "../middleware/logger.js";
import { forbidden, HttpError, unauthorized } from "../errors.js";
import {
  assertBoard,
  assertCompanyAccess,
  getActorInfo,
  hasCompanyViewAll,
  resolveTenantIdForStorage,
} from "./authz.js";
import { assertCompanyIntegrationScope } from "./integration-scope.js";
import { shouldWakeAssigneeOnCheckout } from "./issues-checkout-wakeup.js";
import { isAllowedContentType, MAX_ATTACHMENT_BYTES } from "../attachment-types.js";
import type { ChatServiceInstance } from "./chat.js";
import { parseSkillInvocations } from "../services/skill-invocation-parser.js";

export function issueRoutes(db: Db, storage: StorageService, chatSvc?: ChatServiceInstance) {
  const router = Router();
  const svc = issueService(db);
  const access = accessService(db);
  const heartbeat = heartbeatService(db, storage);
  const agentsSvc = agentService(db);
  const projectsSvc = projectService(db);
  const goalsSvc = goalService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  });

  function withContentPath<T extends { id: string }>(attachment: T) {
    return {
      ...attachment,
      contentPath: `/api/attachments/${attachment.id}/content`,
    };
  }

  async function runSingleFileUpload(req: Request, res: Response) {
    await new Promise<void>((resolve, reject) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function assertCanManageIssueApprovalLinks(req: Request, res: Response, companyId: string) {
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "banned") {
      res.status(403).json({ error: "Account banned" });
      return false;
    }
    if (req.actor.type === "board") return true;
    if (!req.actor.agentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    const actorAgent = await agentsSvc.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    if (actorAgent.role === "ceo" || Boolean(actorAgent.permissions?.canCreateAgents)) return true;
    res.status(403).json({ error: "Missing permission to link approvals" });
    return false;
  }

  function canCreateAgentsLegacy(agent: { permissions: Record<string, unknown> | null | undefined; role: string }) {
    if (agent.role === "ceo") return true;
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function assertCanAssignTasks(req: Request, companyId: string) {
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "board") {
      if (hasCompanyViewAll(req)) return;
      const allowed = await access.canUser(companyId, req.actor.userId, "tasks:assign");
      if (!allowed) throw forbidden("Missing permission: tasks:assign");
      return;
    }
    if (req.actor.type === "agent") {
      if (!req.actor.agentId) throw forbidden("Agent authentication required");
      const allowedByGrant = await access.hasPermission(companyId, "agent", req.actor.agentId, "tasks:assign");
      if (allowedByGrant) return;
      const actorAgent = await agentsSvc.getById(req.actor.agentId);
      if (actorAgent && actorAgent.companyId === companyId && canCreateAgentsLegacy(actorAgent)) return;
      throw forbidden("Missing permission: tasks:assign");
    }
    throw unauthorized();
  }

  /**
   * Agent issue routing guard:
   * - Delegation down: only direct child
   * - Reporting up: only direct parent
   * - No level skipping (no grandchild / grandparent routing)
   */
  async function assertAgentIssueRoutingChain(
    req: Request,
    companyId: string,
    assigneeAgentId: string | null | undefined,
  ) {
    if (req.actor.type !== "agent") return;
    if (!assigneeAgentId) return;
    if (!req.actor.agentId) throw forbidden("Agent authentication required");
    if (assigneeAgentId === req.actor.agentId) return;

    const [actorAgent, targetAgent] = await Promise.all([
      agentsSvc.getById(req.actor.agentId),
      agentsSvc.getById(assigneeAgentId),
    ]);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden("Actor agent not in company");
    }
    if (!targetAgent || targetAgent.companyId !== companyId) {
      throw forbidden("Assignee agent not in company");
    }

    const directChild = targetAgent.reportsTo === actorAgent.id;
    const directParent = actorAgent.reportsTo === targetAgent.id;
    if (directChild || directParent) return;

    let isDescendant = false;
    let cursorId: string | null = targetAgent.reportsTo;
    while (cursorId) {
      if (cursorId === actorAgent.id) {
        isDescendant = true;
        break;
      }
      const next = await agentsSvc.getById(cursorId);
      if (!next || next.companyId !== companyId) break;
      cursorId = next.reportsTo;
    }

    let isAncestor = false;
    cursorId = actorAgent.reportsTo;
    while (cursorId) {
      if (cursorId === targetAgent.id) {
        isAncestor = true;
        break;
      }
      const next = await agentsSvc.getById(cursorId);
      if (!next || next.companyId !== companyId) break;
      cursorId = next.reportsTo;
    }

    if (isDescendant) {
      throw forbidden(
        "Delegation must target a direct child only. Cross-level delegation is not allowed.",
        { code: "issue_assignment_skip_level_down" },
      );
    }
    if (isAncestor) {
      throw forbidden(
        "Reporting must go to your direct parent only. Cross-level reporting is not allowed.",
        { code: "issue_assignment_skip_level_up" },
      );
    }

    throw forbidden(
      "Agent assignment is restricted to direct child delegation or direct parent reporting.",
      { code: "issue_assignment_invalid_chain" },
    );
  }

  function requireAgentRunId(req: Request, res: Response) {
    if (req.actor.type !== "agent") return null;
    const runId = req.actor.runId?.trim();
    if (runId) return runId;
    res.status(401).json({ error: "Agent run id required" });
    return null;
  }

  async function resolveSourceChatRoomIdFromActorRun(
    req: Request,
    companyId: string,
  ): Promise<string | null> {
    if (req.actor.type !== "agent") return null;
    const runId = req.actor.runId?.trim();
    if (!runId) return null;
    const run = await heartbeat.getRun(runId);
    if (!run || run.companyId !== companyId) return null;
    const snapshot =
      run.contextSnapshot && typeof run.contextSnapshot === "object"
        ? (run.contextSnapshot as Record<string, unknown>)
        : null;
    const roomId = snapshot && typeof snapshot.roomId === "string" ? snapshot.roomId.trim() : "";
    return roomId ? roomId : null;
  }

  async function assertAgentRunCheckoutOwnership(
    req: Request,
    res: Response,
    issue: { id: string; companyId: string; status: string; assigneeAgentId: string | null },
  ) {
    if (req.actor.type !== "agent") return true;
    const actorAgentId = req.actor.agentId;
    if (!actorAgentId) {
      res.status(403).json({ error: "Agent authentication required" });
      return false;
    }
    if (issue.status !== "in_progress" || issue.assigneeAgentId !== actorAgentId) {
      return true;
    }
    const runId = requireAgentRunId(req, res);
    if (!runId) return false;
    const ownership = await svc.assertCheckoutOwner(issue.id, actorAgentId, runId);
    if (ownership.adoptedFromRunId) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.checkout_lock_adopted",
        entityType: "issue",
        entityId: issue.id,
        details: {
          previousCheckoutRunId: ownership.adoptedFromRunId,
          checkoutRunId: runId,
          reason: "stale_checkout_run",
        },
      });
    }
    return true;
  }

  async function normalizeIssueIdentifier(rawId: string): Promise<string> {
    if (/^[A-Z]+-\d+$/i.test(rawId)) {
      const issue = await svc.getByIdentifier(rawId);
      if (issue) {
        return issue.id;
      }
    }
    return rawId;
  }

  // Resolve issue identifiers (e.g. "PAP-39") to UUIDs for all /issues/:id routes
  router.param("id", async (req, res, next, rawId) => {
    try {
      req.params.id = await normalizeIssueIdentifier(rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  // Resolve issue identifiers (e.g. "PAP-39") to UUIDs for company-scoped attachment routes.
  router.param("issueId", async (req, res, next, rawId) => {
    try {
      req.params.issueId = await normalizeIssueIdentifier(rawId);
      next();
    } catch (err) {
      next(err);
    }
  });

  // Common malformed path when companyId is empty in "/api/companies/{companyId}/issues".
  router.get("/issues", (_req, res) => {
    res.status(400).json({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });

  router.get("/companies/:companyId/issues", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "issues:read");
    const assigneeUserFilterRaw = req.query.assigneeUserId as string | undefined;
    const touchedByUserFilterRaw = req.query.touchedByUserId as string | undefined;
    const unreadForUserFilterRaw = req.query.unreadForUserId as string | undefined;
    const assigneeUserId =
      assigneeUserFilterRaw === "me" && req.actor.type === "board"
        ? req.actor.userId
        : assigneeUserFilterRaw;
    const touchedByUserId =
      touchedByUserFilterRaw === "me" && req.actor.type === "board"
        ? req.actor.userId
        : touchedByUserFilterRaw;
    const unreadForUserId =
      unreadForUserFilterRaw === "me" && req.actor.type === "board"
        ? req.actor.userId
        : unreadForUserFilterRaw;

    if (assigneeUserFilterRaw === "me" && (!assigneeUserId || req.actor.type !== "board")) {
      res.status(403).json({ error: "assigneeUserId=me requires board authentication" });
      return;
    }
    if (touchedByUserFilterRaw === "me" && (!touchedByUserId || req.actor.type !== "board")) {
      res.status(403).json({ error: "touchedByUserId=me requires board authentication" });
      return;
    }
    if (unreadForUserFilterRaw === "me" && (!unreadForUserId || req.actor.type !== "board")) {
      res.status(403).json({ error: "unreadForUserId=me requires board authentication" });
      return;
    }

    const result = await svc.list(companyId, {
      status: req.query.status as string | undefined,
      assigneeAgentId: req.query.assigneeAgentId as string | undefined,
      assigneeUserId,
      touchedByUserId,
      unreadForUserId,
      projectId: req.query.projectId as string | undefined,
      parentId: req.query.parentId as string | undefined,
      labelId: req.query.labelId as string | undefined,
      q: req.query.q as string | undefined,
    });
    res.json(result);
  });

  router.get("/companies/:companyId/labels", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyIntegrationScope(db, req, companyId, "issues:read");
    const result = await svc.listLabels(companyId);
    res.json(result);
  });

  router.post("/companies/:companyId/labels", validate(createIssueLabelSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot manage labels" });
      return;
    }
    const label = await svc.createLabel(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "label.created",
      entityType: "label",
      entityId: label.id,
      details: { name: label.name, color: label.color },
    });
    res.status(201).json(label);
  });

  router.delete("/labels/:labelId", async (req, res) => {
    const labelId = req.params.labelId as string;
    const existing = await svc.getLabelById(labelId);
    if (!existing) {
      res.status(404).json({ error: "Label not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot manage labels" });
      return;
    }
    const removed = await svc.deleteLabel(labelId);
    if (!removed) {
      res.status(404).json({ error: "Label not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "label.deleted",
      entityType: "label",
      entityId: removed.id,
      details: { name: removed.name, color: removed.color },
    });
    res.json(removed);
  });

  router.get("/issues/:id", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");
    const [ancestors, project, goal, mentionedProjectIds] = await Promise.all([
      svc.getAncestors(issue.id),
      issue.projectId ? projectsSvc.getById(issue.projectId) : null,
      issue.goalId
        ? goalsSvc.getById(issue.goalId)
        : !issue.projectId
          ? goalsSvc.getDefaultCompanyGoal(issue.companyId)
          : null,
      svc.findMentionedProjectIds(issue.id),
    ]);
    const mentionedProjects = mentionedProjectIds.length > 0
      ? await projectsSvc.listByIds(issue.companyId, mentionedProjectIds)
      : [];
    res.json({
      ...issue,
      goalId: goal?.id ?? issue.goalId,
      ancestors,
      project: project ?? null,
      goal: goal ?? null,
      mentionedProjects,
    });
  });

  router.post("/issues/:id/read", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    if (req.actor.type !== "board") {
      res.status(403).json({ error: "Board authentication required" });
      return;
    }
    if (!req.actor.userId) {
      res.status(403).json({ error: "Board user context required" });
      return;
    }
    const readState = await svc.markRead(issue.companyId, issue.id, req.actor.userId, new Date());
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.read_marked",
      entityType: "issue",
      entityId: issue.id,
      details: { userId: req.actor.userId, lastReadAt: readState.lastReadAt },
    });
    res.json(readState);
  });

  router.get("/issues/:id/approvals", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");
    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id);
    res.json(approvals);
  });

  router.post("/issues/:id/approvals", validate(linkIssueApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (!(await assertCanManageIssueApprovalLinks(req, res, issue.companyId))) return;

    const actor = getActorInfo(req);
    await issueApprovalsSvc.link(id, req.body.approvalId, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.approval_linked",
      entityType: "issue",
      entityId: issue.id,
      details: { approvalId: req.body.approvalId },
    });

    const approvals = await issueApprovalsSvc.listApprovalsForIssue(id);
    res.status(201).json(approvals);
  });

  router.delete("/issues/:id/approvals/:approvalId", async (req, res) => {
    const id = req.params.id as string;
    const approvalId = req.params.approvalId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (!(await assertCanManageIssueApprovalLinks(req, res, issue.companyId))) return;

    await issueApprovalsSvc.unlink(id, approvalId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.approval_unlinked",
      entityType: "issue",
      entityId: issue.id,
      details: { approvalId },
    });

    res.json({ ok: true });
  });

  router.post("/companies/:companyId/issues", validate(createIssueSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot create issues" });
      return;
    }
    if (req.body.assigneeAgentId || req.body.assigneeUserId) {
      await assertCanAssignTasks(req, companyId);
    }
    await assertAgentIssueRoutingChain(req, companyId, req.body.assigneeAgentId);
    const sourceChatRoomId =
      typeof req.body.sourceChatRoomId === "string" && req.body.sourceChatRoomId.trim().length > 0
        ? req.body.sourceChatRoomId
        : await resolveSourceChatRoomIdFromActorRun(req, companyId);

    const actor = getActorInfo(req);
    const issue = await svc.create(companyId, {
      ...req.body,
      ...(sourceChatRoomId ? { sourceChatRoomId } : {}),
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.created",
      entityType: "issue",
      entityId: issue.id,
      details: { title: issue.title, identifier: issue.identifier },
    });

    scheduleCompanyNotificationEvent(db, companyId, "issue.created", {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      projectId: issue.projectId,
    });

    if (issue.assigneeAgentId && issue.status !== "backlog") {
      void heartbeat
        .wakeup(issue.assigneeAgentId, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_assigned",
          payload: { issueId: issue.id, mutation: "create" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.create" },
        })
        .catch((err) => logger.warn({ err, issueId: issue.id }, "failed to wake assignee on issue create"));
    }

    res.status(201).json(issue);
  });

  router.patch("/issues/:id", validate(updateIssueSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot update issues" });
      return;
    }
    const assigneeWillChange =
      (req.body.assigneeAgentId !== undefined && req.body.assigneeAgentId !== existing.assigneeAgentId) ||
      (req.body.assigneeUserId !== undefined && req.body.assigneeUserId !== existing.assigneeUserId);

    const isAgentReturningIssueToCreator =
      req.actor.type === "agent" &&
      !!req.actor.agentId &&
      existing.assigneeAgentId === req.actor.agentId &&
      req.body.assigneeAgentId === null &&
      typeof req.body.assigneeUserId === "string" &&
      !!existing.createdByUserId &&
      req.body.assigneeUserId === existing.createdByUserId;

    if (assigneeWillChange) {
      if (!isAgentReturningIssueToCreator) {
        await assertCanAssignTasks(req, existing.companyId);
      }
      await assertAgentIssueRoutingChain(req, existing.companyId, req.body.assigneeAgentId);
    }
    if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) return;

    const { comment: commentBody, hiddenAt: hiddenAtRaw, ...updateFields } = req.body;
    if (hiddenAtRaw !== undefined) {
      updateFields.hiddenAt = hiddenAtRaw ? new Date(hiddenAtRaw) : null;
    }
    let issue;
    try {
      issue = await svc.update(id, updateFields);
    } catch (err) {
      if (err instanceof HttpError && err.status === 422) {
        logger.warn(
          {
            issueId: id,
            companyId: existing.companyId,
            assigneePatch: {
              assigneeAgentId:
                req.body.assigneeAgentId === undefined ? "__omitted__" : req.body.assigneeAgentId,
              assigneeUserId:
                req.body.assigneeUserId === undefined ? "__omitted__" : req.body.assigneeUserId,
            },
            currentAssignee: {
              assigneeAgentId: existing.assigneeAgentId,
              assigneeUserId: existing.assigneeUserId,
            },
            error: err.message,
            details: err.details,
          },
          "issue update rejected with 422",
        );
      }
      throw err;
    }
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    // Build activity details with previous values for changed fields
    const previous: Record<string, unknown> = {};
    for (const key of Object.keys(updateFields)) {
      if (key in existing && (existing as Record<string, unknown>)[key] !== (updateFields as Record<string, unknown>)[key]) {
        previous[key] = (existing as Record<string, unknown>)[key];
      }
    }

    const actor = getActorInfo(req);
    const hasFieldChanges = Object.keys(previous).length > 0;
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.updated",
      entityType: "issue",
      entityId: issue.id,
      details: {
        ...updateFields,
        identifier: issue.identifier,
        ...(commentBody ? { source: "comment" } : {}),
        _previous: hasFieldChanges ? previous : undefined,
      },
    });

    scheduleCompanyNotificationEvent(db, issue.companyId, "issue.updated", {
      issueId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      projectId: issue.projectId,
      changedFields: hasFieldChanges ? Object.keys(previous) : [],
      commentAdded: Boolean(commentBody),
    });

    let comment = null;
    if (commentBody) {
      comment = await svc.addComment(id, commentBody, {
        agentId: actor.agentId ?? undefined,
        userId: actor.actorType === "user" ? actor.actorId : undefined,
      });

      await logActivity(db, {
        companyId: issue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.comment_added",
        entityType: "issue",
        entityId: issue.id,
        details: {
          commentId: comment.id,
          bodySnippet: comment.body.slice(0, 120),
          identifier: issue.identifier,
          issueTitle: issue.title,
          ...(hasFieldChanges ? { updated: true } : {}),
        },
      });

    }

    // Issue 首次標記為完成時，若有關聯的來源聊天室，在該聊天室回報完成與結案說明（與 PATCH 一併送出的 comment）。
    // 須優先使用「在該聊天室內」的 agent 發言；若僅 assignee 不在房內（常見於子 agent），則以內部路徑繞過成員檢查，否則 addMessage 會失敗且聊天端看不到任何輸出。
    const transitionedToDone = existing.status !== "done" && issue.status === "done";
    if (
      transitionedToDone &&
      !issue.parentId &&
      chatSvc
    ) {
      const roomId =
        (issue as { sourceChatRoomId?: string | null }).sourceChatRoomId ??
        await resolveSourceChatRoomIdFromActorRun(req, issue.companyId);
      if (roomId) {
        const candidateIds = [issue.assigneeAgentId, issue.createdByAgentId].filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        );
        const uniqueCandidates = [...new Set(candidateIds)];
        let reportAgentId: string | null = null;
        let skipMembershipCheck = false;
        for (const aid of uniqueCandidates) {
          if (await chatSvc.isMember(roomId, { type: "agent", agentId: aid })) {
            reportAgentId = aid;
            skipMembershipCheck = false;
            break;
          }
        }
        if (!reportAgentId && uniqueCandidates.length > 0) {
          reportAgentId = uniqueCandidates[0];
          skipMembershipCheck = true;
        }
        if (reportAgentId) {
          let reportBody = `Issue ${issue.identifier ?? issue.id} 已完成。`;
          const completionNote = (comment?.body ?? commentBody)?.trim();
          if (completionNote) {
            reportBody += `\n\n${completionNote}`;
          }
          void chatSvc
            .addMessage(
              issue.companyId,
              roomId,
              reportBody,
              { type: "agent", agentId: reportAgentId },
              undefined,
              undefined,
              skipMembershipCheck ? { skipMembershipCheck: true } : undefined,
            )
            .catch((err) =>
              logger.warn(
                { err, issueId: issue.id, roomId },
                "failed to post issue completion to source chat room",
              ),
            );
        } else {
          logger.warn(
            { issueId: issue.id, roomId },
            "issue marked done but no assignee/creator agent to post completion to source chat",
          );
        }
      }
    }

    const assigneeChanged = assigneeWillChange;
    const statusChangedFromBacklog =
      existing.status === "backlog" &&
      issue.status !== "backlog" &&
      req.body.status !== undefined;

    /** 與「執行中內容」相關的欄位變更（不含僅加 comment）才觸發 issue_updated / issue_updated_while_running */
    const CONTENT_FIELDS = ["title", "description", "status", "priority"];
    const hasContentChange = CONTENT_FIELDS.some((k) => k in previous);
    const previousStatus = previous.status as string | undefined;
    const statusJustBecameTerminal =
      previousStatus !== "done" && previousStatus !== "cancelled" && (issue.status === "done" || issue.status === "cancelled");

    // Merge all wakeups from this update into one enqueue per agent to avoid duplicate runs.
    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>();

      // 二、Issue 被修改時：若有該 issue 的 active run 先 cancel，再於下方加入 issue_updated* wake
      let issueUpdatedReason: "issue_updated_while_running" | "issue_updated" | null = null;
      if (hasContentChange && issue.assigneeAgentId) {
        let activeRun: Awaited<ReturnType<typeof heartbeat.getRun>> | null = null;
        if (issue.executionRunId) {
          const run = await heartbeat.getRun(issue.executionRunId);
          if (run && (run.status === "running" || run.status === "queued")) activeRun = run;
        }
        if (!activeRun && issue.assigneeAgentId) {
          const run = await heartbeat.getActiveRunForAgent(issue.assigneeAgentId);
          const snapshotIssueId =
            run?.contextSnapshot && typeof run.contextSnapshot === "object" && "issueId" in run.contextSnapshot
              ? (run.contextSnapshot as Record<string, unknown>).issueId
              : undefined;
          if (run && run.status === "running" && snapshotIssueId === issue.id) activeRun = run;
        }

        // 若目前這次 PATCH 來自相同的 active run（actor.runId === activeRun.id），
        // 表示是 agent 在自己的 heartbeat 中更新 Issue；不應觸發 issue_updated_while_running 迴圈。
        const isSelfRunUpdate = activeRun && actor.runId && activeRun.id === actor.runId;

        if (activeRun && !isSelfRunUpdate) {
          await heartbeat.cancelRun(activeRun.id).catch((err) =>
            logger.warn({ err, issueId: issue.id, runId: activeRun!.id }, "failed to cancel run on issue update"),
          );
          issueUpdatedReason = "issue_updated_while_running";
        } else if (!activeRun) {
          issueUpdatedReason = "issue_updated";
        }
      }

      if (assigneeChanged && issue.assigneeAgentId && issue.status !== "backlog") {
        wakeups.set(issue.assigneeAgentId, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_assigned",
          payload: { issueId: issue.id, mutation: "update" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.update" },
        });
      }

      if (!assigneeChanged && statusChangedFromBacklog && issue.assigneeAgentId) {
        wakeups.set(issue.assigneeAgentId, {
          source: "automation",
          triggerDetail: "system",
          reason: "issue_status_changed",
          payload: { issueId: issue.id, mutation: "update" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.status_change" },
        });
      }

      if (issueUpdatedReason && issue.assigneeAgentId) {
        wakeups.set(issue.assigneeAgentId, {
          source: "automation",
          triggerDetail: "system",
          reason: issueUpdatedReason,
          payload: { issueId: issue.id },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, wakeReason: issueUpdatedReason },
        });
      }

      if (commentBody && comment) {
        let mentionedIds: string[] = [];
        try {
          mentionedIds = await svc.findMentionedAgents(issue.companyId, commentBody);
        } catch (err) {
          logger.warn({ err, issueId: id }, "failed to resolve @-mentions");
        }

        const skillInvocations = parseSkillInvocations(commentBody);
        for (const mentionedId of mentionedIds) {
          if (wakeups.has(mentionedId)) continue;
          if (actor.actorType === "agent" && actor.actorId === mentionedId) continue;
          wakeups.set(mentionedId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_comment_mentioned",
            payload: { issueId: id, commentId: comment.id, ...(skillInvocations.length > 0 ? { skillInvocations } : {}) },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: id,
              taskId: id,
              commentId: comment.id,
              wakeCommentId: comment.id,
              wakeReason: "issue_comment_mentioned",
              source: "comment.mention",
              ...(skillInvocations.length > 0 ? { skillInvocations } : {}),
            },
          });
        }
      }

      if (statusJustBecameTerminal && issue.parentId) {
        const parent = await svc.getById(issue.parentId);
        if (parent) {
          const siblings = await svc.list(issue.companyId, { parentId: issue.parentId });
          const allTerminal =
            siblings.length >= 1 &&
            siblings.every((s) => s.status === "done" || s.status === "cancelled");
          if (allTerminal) {
            const parentAgentId = parent.assigneeAgentId ?? parent.createdByAgentId ?? null;
            if (parentAgentId && !wakeups.has(parentAgentId)) {
              wakeups.set(parentAgentId, {
                source: "automation",
                triggerDetail: "system",
                reason: "all_subissues_completed",
                payload: { parentIssueId: parent.id, completedIssueIds: siblings.map((s) => s.id) },
                requestedByActorType: actor.actorType,
                requestedByActorId: actor.actorId,
                contextSnapshot: { parentIssueId: parent.id, wakeReason: "all_subissues_completed" },
              });
            }
          }
        }
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat
          .wakeup(agentId, wakeup)
          .catch((err) => logger.warn({ err, issueId: issue.id, agentId }, "failed to wake agent on issue update"));
      }
    })();

    if (commentBody && comment) {
      void notifyIssueCommentCreated(db, {
        companyId: issue.companyId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueTitle: issue.title,
        commentId: comment.id,
        commentBody,
        bodySnippet: comment.body.slice(0, 200),
        authorUserId: actor.actorType === "user" ? actor.actorId : null,
        authorAgentId: actor.actorType === "agent" ? actor.actorId : null,
      }).catch((err) =>
        logger.warn({ err, issueId: issue.id }, "notifyIssueCommentCreated failed"),
      );
    }

    res.json({ ...issue, comment });
  });

  router.delete("/issues/:id", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete issues" });
      return;
    }
    const attachments = await svc.listAttachments(id);
    const storageTenantId = await resolveTenantIdForStorage(req, db, existing.companyId);

    const issue = await svc.remove(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    for (const attachment of attachments) {
      try {
        await storage.deleteObject(attachment.companyId, attachment.objectKey, storageTenantId);
      } catch (err) {
        logger.warn({ err, issueId: id, attachmentId: attachment.id }, "failed to delete attachment object during issue delete");
      }
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.deleted",
      entityType: "issue",
      entityId: issue.id,
    });

    res.json(issue);
  });

  router.post("/issues/:id/checkout", validate(checkoutIssueSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot checkout issues" });
      return;
    }

    if (req.actor.type === "agent" && req.actor.agentId !== req.body.agentId) {
      res.status(403).json({ error: "Agent can only checkout as itself" });
      return;
    }

    const checkoutRunId = requireAgentRunId(req, res);
    if (req.actor.type === "agent" && !checkoutRunId) return;
    const updated = await svc.checkout(id, req.body.agentId, req.body.expectedStatuses, checkoutRunId);
    const actor = getActorInfo(req);

    await logActivity(db, {
      companyId: issue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.checked_out",
      entityType: "issue",
      entityId: issue.id,
      details: { agentId: req.body.agentId },
    });

    if (
      shouldWakeAssigneeOnCheckout({
        actorType: req.actor.type === "banned" ? "none" : req.actor.type,
        actorAgentId: req.actor.type === "agent" ? req.actor.agentId ?? null : null,
        checkoutAgentId: req.body.agentId,
        checkoutRunId,
      })
    ) {
      void heartbeat
        .wakeup(req.body.agentId, {
          source: "assignment",
          triggerDetail: "system",
          reason: "issue_checked_out",
          payload: { issueId: issue.id, mutation: "checkout" },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: { issueId: issue.id, source: "issue.checkout" },
        })
        .catch((err) => logger.warn({ err, issueId: issue.id }, "failed to wake assignee on issue checkout"));
    }

    res.json(updated);
  });

  router.post("/issues/:id/release", async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, existing.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot release issues" });
      return;
    }
    if (!(await assertAgentRunCheckoutOwnership(req, res, existing))) return;
    const actorRunId = requireAgentRunId(req, res);
    if (req.actor.type === "agent" && !actorRunId) return;

    const released = await svc.release(
      id,
      req.actor.type === "agent" ? req.actor.agentId : undefined,
      actorRunId,
    );
    if (!released) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: released.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.released",
      entityType: "issue",
      entityId: released.id,
    });

    res.json(released);
  });

  router.get("/issues/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");
    const comments = await svc.listComments(id);
    res.json(comments);
  });

  router.get("/issues/:id/comments/:commentId", async (req, res) => {
    const id = req.params.id as string;
    const commentId = req.params.commentId as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");
    const comment = await svc.getComment(commentId);
    if (!comment || comment.issueId !== id) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    res.json(comment);
  });

  router.post("/issues/:id/comments", validate(addIssueCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot add issue comments" });
      return;
    }
    if (!(await assertAgentRunCheckoutOwnership(req, res, issue))) return;

    const actor = getActorInfo(req);
    const reopenRequested = req.body.reopen === true;
    const interruptRequested = req.body.interrupt === true;
    const isClosed = issue.status === "done" || issue.status === "cancelled";
    let reopened = false;
    let reopenFromStatus: string | null = null;
    let interruptedRunId: string | null = null;
    let currentIssue = issue;

    if (reopenRequested && isClosed) {
      const reopenedIssue = await svc.update(id, { status: "todo" });
      if (!reopenedIssue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      reopened = true;
      reopenFromStatus = issue.status;
      currentIssue = reopenedIssue;

      await logActivity(db, {
        companyId: currentIssue.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "issue.updated",
        entityType: "issue",
        entityId: currentIssue.id,
        details: {
          status: "todo",
          reopened: true,
          reopenedFrom: reopenFromStatus,
          source: "comment",
          identifier: currentIssue.identifier,
        },
      });

      scheduleCompanyNotificationEvent(db, currentIssue.companyId, "issue.updated", {
        issueId: currentIssue.id,
        identifier: currentIssue.identifier,
        title: currentIssue.title,
        status: currentIssue.status,
        projectId: currentIssue.projectId,
        changedFields: ["status"],
        reopened: true,
        reopenedFrom: reopenFromStatus,
        source: "comment",
      });
    }

    if (interruptRequested) {
      if (req.actor.type !== "board") {
        res.status(403).json({ error: "Only board users can interrupt active runs from issue comments" });
        return;
      }

      let runToInterrupt = currentIssue.executionRunId
        ? await heartbeat.getRun(currentIssue.executionRunId)
        : null;

      if (
        (!runToInterrupt || runToInterrupt.status !== "running") &&
        currentIssue.assigneeAgentId
      ) {
        const activeRun = await heartbeat.getActiveRunForAgent(currentIssue.assigneeAgentId);
        const activeIssueId =
          activeRun &&
            activeRun.contextSnapshot &&
            typeof activeRun.contextSnapshot === "object" &&
            typeof (activeRun.contextSnapshot as Record<string, unknown>).issueId === "string"
            ? ((activeRun.contextSnapshot as Record<string, unknown>).issueId as string)
            : null;
        if (activeRun && activeRun.status === "running" && activeIssueId === currentIssue.id) {
          runToInterrupt = activeRun;
        }
      }

      if (runToInterrupt && runToInterrupt.status === "running") {
        const cancelled = await heartbeat.cancelRun(runToInterrupt.id);
        if (cancelled) {
          interruptedRunId = cancelled.id;
          await logActivity(db, {
            companyId: cancelled.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "heartbeat.cancelled",
            entityType: "heartbeat_run",
            entityId: cancelled.id,
            details: { agentId: cancelled.agentId, source: "issue_comment_interrupt", issueId: currentIssue.id },
          });
        }
      }
    }

    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: currentIssue.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.comment_added",
      entityType: "issue",
      entityId: currentIssue.id,
      details: {
        commentId: comment.id,
        bodySnippet: comment.body.slice(0, 120),
        identifier: currentIssue.identifier,
        issueTitle: currentIssue.title,
        ...(reopened ? { reopened: true, reopenedFrom: reopenFromStatus, source: "comment" } : {}),
        ...(interruptedRunId ? { interruptedRunId } : {}),
      },
    });

    // Merge all wakeups from this comment into one enqueue per agent to avoid duplicate runs.
    void (async () => {
      const wakeups = new Map<string, Parameters<typeof heartbeat.wakeup>[1]>();
      const assigneeId = currentIssue.assigneeAgentId;
      const actorIsAgent = actor.actorType === "agent";
      const selfComment = actorIsAgent && actor.actorId === assigneeId;
      const skipWake = selfComment || isClosed;
      if (assigneeId && (reopened || !skipWake)) {
        if (reopened) {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_reopened_via_comment",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              reopenedFrom: reopenFromStatus,
              mutation: "comment",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              source: "issue.comment.reopen",
              wakeReason: "issue_reopened_via_comment",
              reopenedFrom: reopenFromStatus,
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        } else {
          wakeups.set(assigneeId, {
            source: "automation",
            triggerDetail: "system",
            reason: "issue_commented",
            payload: {
              issueId: currentIssue.id,
              commentId: comment.id,
              mutation: "comment",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
            requestedByActorType: actor.actorType,
            requestedByActorId: actor.actorId,
            contextSnapshot: {
              issueId: currentIssue.id,
              taskId: currentIssue.id,
              commentId: comment.id,
              source: "issue.comment",
              wakeReason: "issue_commented",
              ...(interruptedRunId ? { interruptedRunId } : {}),
            },
          });
        }
      }

      let mentionedIds: string[] = [];
      try {
        mentionedIds = await svc.findMentionedAgents(issue.companyId, req.body.body);
      } catch (err) {
        logger.warn({ err, issueId: id }, "failed to resolve @-mentions");
      }

      for (const mentionedId of mentionedIds) {
        if (wakeups.has(mentionedId)) continue;
        if (actorIsAgent && actor.actorId === mentionedId) continue;
        wakeups.set(mentionedId, {
          source: "automation",
          triggerDetail: "system",
          reason: "issue_comment_mentioned",
          payload: { issueId: id, commentId: comment.id },
          requestedByActorType: actor.actorType,
          requestedByActorId: actor.actorId,
          contextSnapshot: {
            issueId: id,
            taskId: id,
            commentId: comment.id,
            wakeCommentId: comment.id,
            wakeReason: "issue_comment_mentioned",
            source: "comment.mention",
          },
        });
      }

      for (const [agentId, wakeup] of wakeups.entries()) {
        heartbeat
          .wakeup(agentId, wakeup)
          .catch((err) => logger.warn({ err, issueId: currentIssue.id, agentId }, "failed to wake agent on issue comment"));
      }
    })();

    void notifyIssueCommentCreated(db, {
      companyId: currentIssue.companyId,
      issueId: currentIssue.id,
      issueIdentifier: currentIssue.identifier,
      issueTitle: currentIssue.title,
      commentId: comment.id,
      commentBody: req.body.body,
      bodySnippet: comment.body.slice(0, 200),
      authorUserId: actor.actorType === "user" ? actor.actorId : null,
      authorAgentId: actor.actorType === "agent" ? actor.actorId : null,
    }).catch((err) =>
      logger.warn({ err, issueId: currentIssue.id }, "notifyIssueCommentCreated failed"),
    );

    res.status(201).json(comment);
  });

  router.get("/issues/:id/attachments", async (req, res) => {
    const issueId = req.params.id as string;
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, issue.companyId, "issues:read");
    const attachments = await svc.listAttachments(issueId);
    res.json(attachments.map(withContentPath));
  });

  router.post("/companies/:companyId/issues/:issueId/attachments", async (req, res) => {
    const companyId = req.params.companyId as string;
    const issueId = req.params.issueId as string;
    await assertCompanyAccess(req, companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot upload attachments" });
      return;
    }
    const issue = await svc.getById(issueId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    if (issue.companyId !== companyId) {
      res.status(422).json({ error: "Issue does not belong to company" });
      return;
    }

    try {
      await runSingleFileUpload(req, res);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(422).json({ error: `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }

    const file = (req as Request & { file?: { mimetype: string; buffer: Buffer; originalname: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Missing file field 'file'" });
      return;
    }
    const contentType = (file.mimetype || "").toLowerCase();
    if (!isAllowedContentType(contentType)) {
      res.status(422).json({ error: `Unsupported attachment type: ${contentType || "unknown"}` });
      return;
    }
    if (file.buffer.length <= 0) {
      res.status(422).json({ error: "Attachment is empty" });
      return;
    }

    const parsedMeta = createIssueAttachmentMetadataSchema.safeParse(req.body ?? {});
    if (!parsedMeta.success) {
      res.status(400).json({ error: "Invalid attachment metadata", details: parsedMeta.error.issues });
      return;
    }

    const actor = getActorInfo(req);
    const tenantId = await resolveTenantIdForStorage(req, db, companyId);
    const stored = await storage.putFile({
      tenantId,
      companyId,
      namespace: `issues/${issueId}`,
      originalFilename: file.originalname || null,
      contentType,
      body: file.buffer,
    });

    const attachment = await svc.createAttachment({
      issueId,
      issueCommentId: parsedMeta.data.issueCommentId ?? null,
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_added",
      entityType: "issue",
      entityId: issueId,
      details: {
        attachmentId: attachment.id,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        byteSize: attachment.byteSize,
      },
    });

    res.status(201).json(withContentPath(attachment));
  });

  router.get("/attachments/:attachmentId/content", async (req, res, next) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    await assertCompanyIntegrationScope(db, req, attachment.companyId, "issues:read");

    const tenantId = await resolveTenantIdForStorage(req, db, attachment.companyId);
    const object = await storage.getObject(attachment.companyId, attachment.objectKey, tenantId);
    res.setHeader("Content-Type", attachment.contentType || object.contentType || "application/octet-stream");
    res.setHeader("Content-Length", String(attachment.byteSize || object.contentLength || 0));
    res.setHeader("Cache-Control", "private, max-age=60");
    const filename = attachment.originalFilename ?? "attachment";
    res.setHeader("Content-Disposition", `inline; filename=\"${filename.replaceAll("\"", "")}\"`);

    object.stream.on("error", (err) => {
      next(err);
    });
    object.stream.pipe(res);
  });

  router.delete("/attachments/:attachmentId", async (req, res) => {
    const attachmentId = req.params.attachmentId as string;
    const attachment = await svc.getAttachmentById(attachmentId);
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    await assertCompanyAccess(req, attachment.companyId, db);
    if (req.actor.type === "service") {
      res.status(403).json({ error: "Integration token cannot delete attachments" });
      return;
    }

    try {
      const tenantId = await resolveTenantIdForStorage(req, db, attachment.companyId);
      await storage.deleteObject(attachment.companyId, attachment.objectKey, tenantId);
    } catch (err) {
      logger.warn({ err, attachmentId }, "storage delete failed while removing attachment");
    }

    const removed = await svc.removeAttachment(attachmentId);
    if (!removed) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: removed.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "issue.attachment_removed",
      entityType: "issue",
      entityId: removed.issueId,
      details: {
        attachmentId: removed.id,
      },
    });

    res.json({ ok: true });
  });

  router.get("/issues/:id/subscription", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(403).json({ error: "User id required" });
      return;
    }
    const subscribed = await svc.isIssueSubscribed(id, userId);
    res.json({ subscribed });
  });

  router.post("/issues/:id/subscription", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(403).json({ error: "User id required" });
      return;
    }
    await svc.subscribeIssue(issue.companyId, id, userId);
    res.status(204).send();
  });

  router.delete("/issues/:id/subscription", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const issue = await svc.getById(id);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    await assertCompanyAccess(req, issue.companyId, db);
    const userId = req.actor.userId;
    if (!userId) {
      res.status(403).json({ error: "User id required" });
      return;
    }
    await svc.unsubscribeIssue(issue.companyId, id, userId);
    res.status(204).send();
  });

  return router;
}
