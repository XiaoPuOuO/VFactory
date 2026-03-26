import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";
import type { SkillFrontmatter } from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

export type SkillRegistryEntry = {
  name: string;
  /**
   * Parsed and validated frontmatter.
   * Runtime will treat it as canonical skill spec (v0).
   */
  frontmatter: SkillFrontmatter;
  /**
   * Absolute path to `<skillDir>/SKILL.md` (for debugging / audit).
   */
  filePath: string;
};

export type SkillRegistry = {
  skillsByName: Map<string, SkillRegistryEntry>;
};

const AGENT_SETTING_DIR = "AgentSetting";
const SKILLS_DIR = "skills";

const CACHE_TTL_MS = 10_000;

const cacheByRoot = new Map<string, { expiresAt: number; registry: SkillRegistry }>();

function normalizeSkillKey(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

function getWorkspaceSkillsRoot(workspaceCwd: string): string {
  return path.resolve(workspaceCwd, AGENT_SETTING_DIR, SKILLS_DIR);
}

async function listSkillDirNames(skillsRoot: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function loadSingleSkill(skillsRoot: string, dirName: string): Promise<SkillRegistryEntry | null> {
  const normalizedKey = normalizeSkillKey(dirName);
  const skillMdPath = path.join(skillsRoot, dirName, "SKILL.md");
  let markdown: string;
  try {
    markdown = await fs.readFile(skillMdPath, "utf8");
  } catch {
    return null;
  }

  const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
  if (!parsed.success) {
    logger.warn(
      { err: parsed.error, skillKey: normalizedKey, filePath: skillMdPath },
      "skill registry: failed to parse skill frontmatter",
    );
    return null;
  }

  // v0: frontmatter.name is the canonical key.
  const fm = parsed.data as SkillFrontmatter;
  const canonicalKey = normalizeSkillKey(fm.name);
  return {
    name: canonicalKey,
    frontmatter: fm,
    filePath: skillMdPath,
  };
}

/**
 * Load skill registry from a workspace governance directory.
 * v0 rules:
 * - Read only `<workspaceCwd>/AgentSetting/skills/<skill>/SKILL.md`
 * - Invalid skills are skipped (never fail heartbeat).
 */
export async function loadSkillRegistryForWorkspace(workspaceCwd: string): Promise<SkillRegistry> {
  const skillsRoot = getWorkspaceSkillsRoot(workspaceCwd);
  const cacheKey = skillsRoot;
  const now = Date.now();

  const cached = cacheByRoot.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.registry;

  const registry: SkillRegistry = { skillsByName: new Map() };
  const dirNames = await listSkillDirNames(skillsRoot);
  await Promise.all(
    dirNames.map(async (dirName) => {
      const entry = await loadSingleSkill(skillsRoot, dirName);
      if (!entry) return;
      registry.skillsByName.set(entry.name, entry);
    }),
  );

  cacheByRoot.set(cacheKey, { expiresAt: now + CACHE_TTL_MS, registry });
  return registry;
}

export function buildEmptySkillRegistry(): SkillRegistry {
  return { skillsByName: new Map() };
}

