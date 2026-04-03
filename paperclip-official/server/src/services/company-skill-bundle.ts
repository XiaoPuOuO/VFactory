import { and, desc, eq, or, sql } from "drizzle-orm";
import { assets as assetsTable, companies } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { StorageService } from "../storage/types.js";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";
import type { SkillFrontmatter } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

export type CompanySkillBundleV0 = {
  version: "v0";
  skills: Array<{
    /**
     * Full `SKILL.md` text (YAML frontmatter + Markdown body).
     * We store it to support future extensions without losing user content.
     */
    skillMarkdown: string;
  }>;
};

export type LoadedCompanySkill = {
  key: string; // normalized name for merging/deduplication
  name: string; // canonical frontmatter.name (already validated)
  frontmatter: SkillFrontmatter;
  skillMarkdown: string; // original input markdown
};

const SKILL_BUNDLE_NAMESPACE = "skills/company-skills";
const SKILL_BUNDLE_ORIGINAL_FILENAME = "company-skills.v0.json";
const SKILL_BUNDLE_CONTENT_TYPE = "application/json";

function resolveCompanySkillsCacheTtlMs(): number {
  const raw = process.env.HEARTBEAT_COMPANY_SKILLS_CACHE_TTL_MS;
  if (raw == null || raw.trim() === "") return 10_000;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 10_000;
  return Math.min(n, 3_600_000);
}

const CACHE_TTL_MS = resolveCompanySkillsCacheTtlMs();

type CacheEntry = {
  expiresAt: number;
  loaded: LoadedCompanySkill[];
};

const cacheByCompanyId = new Map<string, CacheEntry>();

/**
 * Clears the in-memory bundle cache for one company. Call after any mutation that
 * writes a new company-skills bundle so GET /skills immediately reflects storage.
 */
export function invalidateCompanySkillBundleCache(companyId: string): void {
  cacheByCompanyId.delete(companyId);
}

function normalizeSkillKey(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

/** 舊版 `companyId/...` 與新版 `tenantId/companyId/...` 物件鍵前綴（供 LIKE 查詢）。 */
function skillBundleObjectKeyPrefixes(companyId: string, tenantId: string): { legacy: string; withTenant: string } {
  return {
    legacy: `${companyId}/${SKILL_BUNDLE_NAMESPACE}/`,
    withTenant: `${tenantId}/${companyId}/${SKILL_BUNDLE_NAMESPACE}/`,
  };
}

async function readStorageObjectToText(
  storage: StorageService,
  companyId: string,
  objectKey: string,
  tenantId: string,
): Promise<string> {
  const obj = await storage.getObject(companyId, objectKey, tenantId);
  const chunks: Buffer[] = [];
  for await (const chunk of obj.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseBundleJson(jsonText: string): CompanySkillBundleV0 | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (rec.version !== "v0") return null;
    const skills = rec.skills;
    if (!Array.isArray(skills)) return null;
    return {
      version: "v0",
      skills: skills
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const r = s as Record<string, unknown>;
          const skillMarkdown = r.skillMarkdown;
          if (typeof skillMarkdown !== "string") return null;
          return { skillMarkdown };
        })
        .filter((x): x is { skillMarkdown: string } => x != null),
    };
  } catch {
    return null;
  }
}

async function loadLatestBundleFromAssets(db: Db, storage: StorageService, companyId: string): Promise<CompanySkillBundleV0 | null> {
  const company = await db
    .select({ tenantId: companies.tenantId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);
  if (!company?.tenantId) return null;
  const tenantId = company.tenantId;
  const { legacy, withTenant } = skillBundleObjectKeyPrefixes(companyId, tenantId);
  const patternLegacy = `${legacy}%`;
  const patternWithTenant = `${withTenant}%`;

  const row = await db
    .select({ id: assetsTable.id, objectKey: assetsTable.objectKey, createdAt: assetsTable.createdAt })
    .from(assetsTable)
    .where(
      and(
        eq(assetsTable.companyId, companyId),
        or(
          sql`${assetsTable.objectKey} like ${patternLegacy}`,
          sql`${assetsTable.objectKey} like ${patternWithTenant}`,
        ),
        eq(assetsTable.contentType, SKILL_BUNDLE_CONTENT_TYPE),
      ),
    )
    .orderBy(desc(assetsTable.createdAt))
    .limit(1);

  if (!row[0]) return null;

  const jsonText = await readStorageObjectToText(storage, companyId, row[0]!.objectKey, tenantId);
  return parseBundleJson(jsonText);
}

function parseCompanySkills(bundle: CompanySkillBundleV0): LoadedCompanySkill[] {
  const out: LoadedCompanySkill[] = [];
  for (const skill of bundle.skills) {
    const markdown = skill.skillMarkdown;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    if (!parsed.success) {
      logger.warn(
        { err: parsed.error, company: "unknown", skillMarkdownPreview: markdown.slice(0, 120) },
        "company skill bundle: invalid skill frontmatter; skipped",
      );
      continue;
    }
    const frontmatter = parsed.data as SkillFrontmatter;
    const key = normalizeSkillKey(frontmatter.name);
    out.push({
      key,
      name: frontmatter.name,
      frontmatter,
      skillMarkdown: markdown,
    });
  }
  return out;
}

/**
 * Load company-level skills for heartbeat injection.
 * - Reads the latest company skill bundle from company assets.
 * - Parses every embedded `SKILL.md` frontmatter and skips invalid ones.
 * - Applies in-memory caching with short TTL.
 */
export async function loadCompanySkillsForInjection(args: {
  db: Db;
  storage: StorageService;
  companyId: string;
}): Promise<LoadedCompanySkill[]> {
  const now = Date.now();
  const cached = cacheByCompanyId.get(args.companyId);
  if (cached && cached.expiresAt > now) return cached.loaded;

  try {
    const bundle = await loadLatestBundleFromAssets(args.db, args.storage, args.companyId);
    if (!bundle) {
      const empty: LoadedCompanySkill[] = [];
      cacheByCompanyId.set(args.companyId, { expiresAt: now + CACHE_TTL_MS, loaded: empty });
      return empty;
    }
    const loaded = parseCompanySkills(bundle);
    cacheByCompanyId.set(args.companyId, { expiresAt: now + CACHE_TTL_MS, loaded });
    return loaded;
  } catch (err) {
    logger.warn({ err, companyId: args.companyId }, "company skill bundle: failed to load; injection skipped");
    const empty: LoadedCompanySkill[] = [];
    cacheByCompanyId.set(args.companyId, { expiresAt: now + CACHE_TTL_MS, loaded: empty });
    return empty;
  }
}

/**
 * Load company skill bundle raw JSON for export or diffing.
 */
export async function loadCompanySkillBundleForExport(args: {
  db: Db;
  storage: StorageService;
  companyId: string;
}): Promise<CompanySkillBundleV0> {
  const bundle = await loadLatestBundleFromAssets(args.db, args.storage, args.companyId);
  return (
    bundle ?? {
      version: "v0",
      skills: [],
    }
  );
}

export const companySkillBundleConstants = {
  namespace: SKILL_BUNDLE_NAMESPACE,
  originalFilename: SKILL_BUNDLE_ORIGINAL_FILENAME,
  contentType: SKILL_BUNDLE_CONTENT_TYPE,
};

