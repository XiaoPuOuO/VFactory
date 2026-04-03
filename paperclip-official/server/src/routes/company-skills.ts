import { Router, type Response } from "express";
import type { Db } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";
import type { SkillFrontmatter } from "@paperclipai/shared";

/** 聊天室輸入 `/` 時可挑選：active、具 flow、且非僅排程／事件觸發的工作流程。 */
function isManualSlashWorkflow(fm: SkillFrontmatter): boolean {
  if (fm.mode !== "active") return false;
  const flow = fm.flow;
  if (!flow || flow.length === 0) return false;
  const on = fm.trigger?.on;
  if (on === "schedule" || on === "event") return false;
  return true;
}
import { assertCompanyAccess, getActorInfo, resolveTenantIdForStorage } from "./authz.js";
import { assertBoard } from "./authz.js";
import {
  companySkillBundleConstants,
  invalidateCompanySkillBundleCache,
  loadCompanySkillBundleForExport,
  loadCompanySkillsForInjection,
} from "../services/company-skill-bundle.js";
import { assetService, logActivity } from "../services/index.js";
import { logger } from "../middleware/logger.js";

const MAX_SKILL_MARKDOWN_CHARS = 250_000;
const MAX_BUNDLE_SKILLS = 200;
const MAX_BUNDLE_TOTAL_CHARS = 2_000_000;

const importModeSchema = z.enum(["upsert", "replace"]);

const importSkillSchema = z
  .object({
    skillMarkdown: z.string().min(1).max(MAX_SKILL_MARKDOWN_CHARS),
  })
  .strict();

const importCompanySkillsSchema = z
  .object({
    mode: importModeSchema,
    skills: z.array(importSkillSchema).max(MAX_BUNDLE_SKILLS),
  })
  .strict();

function normalizeSkillKey(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

export function companySkillRoutes(db: Db, storage: StorageService) {
  const router = Router();
  const svc = assetService(db);

  function assertBoardEditor(req: any) {
    // Company skill mutations are controlled via UI (board actor).
    // Reject any non-board actor (e.g. integration/service or agent automation tokens).
    assertBoard(req);
  }

  function persistBundle(args: {
    companyId: string;
    tenantId: string;
    skills: Array<{ key: string; skillMarkdown: string }>;
    actor: ReturnType<typeof getActorInfo>;
    action: string;
    res: Response;
  }): Promise<{ ok: true } | undefined> {
    return (async () => {
      const mergedSkills = args.skills;
      const totalChars = mergedSkills.reduce((sum, s) => sum + s.skillMarkdown.length, 0);
      if (mergedSkills.length > MAX_BUNDLE_SKILLS) {
        args.res.status(422).json({ error: `Skill bundle max size exceeded (${MAX_BUNDLE_SKILLS})` });
        return undefined;
      }
      if (totalChars > MAX_BUNDLE_TOTAL_CHARS) {
        args.res.status(422).json({ error: `Skill bundle exceeds max size (${MAX_BUNDLE_TOTAL_CHARS} chars)` });
        return undefined;
      }

      const bundleToStore = {
        version: "v0",
        skills: mergedSkills.map((s) => ({ skillMarkdown: s.skillMarkdown })),
      };

      const jsonText = JSON.stringify(bundleToStore, null, 2);
      const stored = await storage.putFile({
        tenantId: args.tenantId,
        companyId: args.companyId,
        namespace: companySkillBundleConstants.namespace,
        originalFilename: companySkillBundleConstants.originalFilename,
        contentType: companySkillBundleConstants.contentType,
        body: Buffer.from(jsonText, "utf8"),
      });

      const asset = await svc.create(args.companyId, {
        provider: stored.provider,
        objectKey: stored.objectKey,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        originalFilename: stored.originalFilename,
        createdByAgentId: args.actor.actorType === "agent" ? args.actor.agentId : null,
        createdByUserId: args.actor.actorType === "user" ? args.actor.actorId : null,
      });

      await logActivity(db, {
        companyId: args.companyId,
        actorType: args.actor.actorType,
        actorId: args.actor.actorId,
        agentId: args.actor.actorType === "agent" ? args.actor.agentId ?? null : null,
        action: args.action,
        entityType: "companySkillBundle",
        entityId: asset.id,
        details: { skillsCount: mergedSkills.length },
      });

      invalidateCompanySkillBundleCache(args.companyId);
      return { ok: true as const };
    })();
  }

  router.get("/companies/:companyId/skills", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);

    const q = req.query as { includeInternal?: string };
    const includeInternal = q.includeInternal === "1" || q.includeInternal === "true";

    const loaded = await loadCompanySkillsForInjection({ db, storage, companyId });
    const mapped = loaded.map((s) => {
      const internal = s.frontmatter.metadata?.internal === true;
      return {
        key: s.key,
        name: s.name,
        description: s.frontmatter.description,
        mode: s.frontmatter.mode,
        skillMarkdown: s.skillMarkdown,
        internal,
        isManualSlashWorkflow: isManualSlashWorkflow(s.frontmatter),
      };
    });

    const skills = includeInternal ? mapped : mapped.filter((row) => !row.internal);

    res.json({ skills });
  });

  router.get("/companies/:companyId/skills/export/latest", async (req, res) => {
    const companyId = req.params.companyId as string;
    await assertCompanyAccess(req, companyId, db);

    const bundle = await loadCompanySkillBundleForExport({ db, storage, companyId });
    res.json(bundle);
  });

  router.post("/companies/:companyId/skills/import", validate(importCompanySkillsSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);

    const body = req.body as z.infer<typeof importCompanySkillsSchema>;

    const totalChars = body.skills.reduce((sum, s) => sum + s.skillMarkdown.length, 0);
    if (totalChars > MAX_BUNDLE_TOTAL_CHARS) {
      res.status(422).json({ error: `Skill bundle exceeds max size (${MAX_BUNDLE_TOTAL_CHARS} chars)` });
      return;
    }

    // Parse & validate imported skills first. Fail-fast on the first invalid entry.
    const importedParsed: Array<{ key: string; name: string; frontmatter: SkillFrontmatter; skillMarkdown: string }> = [];
    for (const skill of body.skills) {
      const parsedFm = safeParseSkillFrontmatterFromMarkdown(skill.skillMarkdown);
      if (!parsedFm.success) {
        logger.warn({ err: parsedFm.error, companyId }, "company skill import: invalid skillMarkdown");
        res.status(422).json({
          error: "Invalid skillMarkdown (skill frontmatter validation failed)",
          details: parsedFm.error,
        });
        return;
      }
      const frontmatter = parsedFm.data as SkillFrontmatter;
      const key = normalizeSkillKey(frontmatter.name);
      importedParsed.push({
        key,
        name: frontmatter.name,
        frontmatter,
        skillMarkdown: skill.skillMarkdown,
      });
    }

    // Load existing bundle for upsert, otherwise start from empty.
    const baseLoaded = body.mode === "upsert" ? await loadCompanySkillsForInjection({ db, storage, companyId }) : [];

    const merged = new Map<string, (typeof importedParsed)[number]>();
    for (const entry of baseLoaded) {
      merged.set(entry.key, {
        key: entry.key,
        name: entry.name,
        frontmatter: entry.frontmatter,
        skillMarkdown: entry.skillMarkdown,
      });
    }
    for (const entry of importedParsed) {
      merged.set(entry.key, entry);
    }

    // Keep Map insertion order for determinism (overwrite keeps original order in JS Map).
    const mergedSkills = Array.from(merged.values());
    const bundleToStore = {
      version: "v0",
      skills: mergedSkills.map((s) => ({ skillMarkdown: s.skillMarkdown })),
    };

    const actor = getActorInfo(req);
    const tenantId = await resolveTenantIdForStorage(req, db, companyId);
    const jsonText = JSON.stringify(bundleToStore, null, 2);
    const stored = await storage.putFile({
      tenantId,
      companyId,
      namespace: companySkillBundleConstants.namespace,
      originalFilename: companySkillBundleConstants.originalFilename,
      contentType: companySkillBundleConstants.contentType,
      body: Buffer.from(jsonText, "utf8"),
    });

    const asset = await svc.create(companyId, {
      provider: stored.provider,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      originalFilename: stored.originalFilename,
      createdByAgentId: actor.actorType === "agent" ? actor.agentId : null,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.actorType === "agent" ? actor.agentId ?? null : null,
      action: "company.skills.import",
      entityType: "companySkillBundle",
      entityId: asset.id,
      details: {
        skillsCount: mergedSkills.length,
      },
    });

    invalidateCompanySkillBundleCache(companyId);
    res.status(201).json({ ok: true });
  });

  const skillMarkdownSchema = z
    .object({
      skillMarkdown: z.string().min(1).max(MAX_SKILL_MARKDOWN_CHARS),
    })
    .strict();

  router.post("/companies/:companyId/skills", validate(skillMarkdownSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);

    const body = req.body as z.infer<typeof skillMarkdownSchema>;
    const parsedFm = safeParseSkillFrontmatterFromMarkdown(body.skillMarkdown);
    if (!parsedFm.success) {
      res.status(422).json({ error: "Invalid skillMarkdown", details: parsedFm.error });
      return;
    }

    const frontmatter = parsedFm.data as SkillFrontmatter;
    const key = normalizeSkillKey(frontmatter.name);

    const baseLoaded = await loadCompanySkillsForInjection({ db, storage, companyId });
    const existing = baseLoaded.find((s) => s.key === key);
    if (existing) {
      res.status(409).json({ error: "Skill already exists" });
      return;
    }

    const actor = getActorInfo(req);
    const tenantId = await resolveTenantIdForStorage(req, db, companyId);
    const nextSkills = [...baseLoaded.map((s) => ({ key: s.key, skillMarkdown: s.skillMarkdown })), { key, skillMarkdown: body.skillMarkdown }];
    const result = await persistBundle({
      companyId,
      tenantId,
      skills: nextSkills,
      actor,
      action: "company.skills.create",
      res,
    });
    if (!result) return;
    res.status(201).json(result);
  });

  router.patch("/companies/:companyId/skills/:skillName", validate(skillMarkdownSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillName = req.params.skillName as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);

    const body = req.body as z.infer<typeof skillMarkdownSchema>;
    const parsedFm = safeParseSkillFrontmatterFromMarkdown(body.skillMarkdown);
    if (!parsedFm.success) {
      res.status(422).json({ error: "Invalid skillMarkdown", details: parsedFm.error });
      return;
    }
    const frontmatter = parsedFm.data as SkillFrontmatter;
    const keyFromBody = normalizeSkillKey(frontmatter.name);
    const keyFromParam = normalizeSkillKey(skillName);

    const baseLoaded = await loadCompanySkillsForInjection({ db, storage, companyId });
    const found = baseLoaded.find((s) => s.key === keyFromParam);
    if (!found) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    /**
     * 更新時允許「改名」：URL 參數為既有技能的 key（正規化後），body 內 frontmatter.name 可為新識別名。
     * 新名稱不得與 bundle 內其他技能衝突（排除正在編輯的這一筆）。
     */
    if (keyFromBody !== keyFromParam) {
      const nameTaken = baseLoaded.some((s) => s.key === keyFromBody && s.key !== keyFromParam);
      if (nameTaken) {
        res.status(409).json({ error: "Skill name already exists" });
        return;
      }
    }

    const actor = getActorInfo(req);
    const tenantId = await resolveTenantIdForStorage(req, db, companyId);
    const nextSkills = baseLoaded.map((s) => {
      if (s.key !== keyFromParam) return { key: s.key, skillMarkdown: s.skillMarkdown };
      return { key: keyFromBody, skillMarkdown: body.skillMarkdown };
    });

    const result = await persistBundle({
      companyId,
      tenantId,
      skills: nextSkills,
      actor,
      action: "company.skills.update",
      res,
    });
    if (!result) return;
    res.status(200).json(result);
  });

  router.delete("/companies/:companyId/skills/:skillName", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillName = req.params.skillName as string;
    assertBoardEditor(req);
    await assertCompanyAccess(req, companyId, db);

    const keyFromParam = normalizeSkillKey(skillName);
    const baseLoaded = await loadCompanySkillsForInjection({ db, storage, companyId });
    const exists = baseLoaded.some((s) => s.key === keyFromParam);
    if (!exists) {
      res.status(404).json({ error: "Skill not found" });
      return;
    }

    const actor = getActorInfo(req);
    const tenantId = await resolveTenantIdForStorage(req, db, companyId);
    const nextSkills = baseLoaded
      .filter((s) => s.key !== keyFromParam)
      .map((s) => ({ key: s.key, skillMarkdown: s.skillMarkdown }));

    const result = await persistBundle({
      companyId,
      tenantId,
      skills: nextSkills,
      actor,
      action: "company.skills.delete",
      res,
    });
    if (!result) return;
    res.status(200).json(result);
  });

  return router;
}

