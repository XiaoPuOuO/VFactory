import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import {
  extractSkillFrontmatterYaml,
  safeParseSkillFrontmatterFromMarkdown,
  skillFrontmatterSchema,
} from "@paperclipai/shared";
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

function parseLegacyFrontmatterYaml(yamlText: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const rawLine of yamlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, valueRaw] = match;
    const value = valueRaw.trim().replace(/^['"]|['"]$/g, "");
    record[key] = value;
  }
  return record;
}

function toLegacyCompatFrontmatter(record: Record<string, unknown>, body: string): Record<string, unknown> {
  const compat: Record<string, unknown> = {
    name: record.name,
    description: record.description,
    mode: record.mode ?? "active",
  };

  if (typeof record.prompt === "string") compat.prompt = record.prompt;
  if (Array.isArray(record.arguments)) compat.arguments = record.arguments;
  if (Array.isArray(record.flow)) compat.flow = record.flow;
  if (record.trigger && typeof record.trigger === "object" && !Array.isArray(record.trigger)) {
    compat.trigger = record.trigger;
  }
  if (record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)) {
    compat.metadata = record.metadata;
  }
  if (
    typeof compat.prompt !== "string" &&
    !Array.isArray(compat.flow) &&
    body.length > 0
  ) {
    compat.prompt = body;
  }
  return compat;
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
  const resolvedFrontmatter = (() => {
    if (parsed.success) return parsed.data as SkillFrontmatter;

    const yamlText = extractSkillFrontmatterYaml(markdown);
    if (!yamlText) return null;

    const body = markdown.replace(/^---[\s\S]*?---\s*/, "").trim();

    try {
      const legacyRecord = parseLegacyFrontmatterYaml(yamlText);
      const withCompatDefaults = toLegacyCompatFrontmatter(legacyRecord, body);
      const compatParsed = skillFrontmatterSchema.safeParse(withCompatDefaults);
      if (compatParsed.success) {
        logger.info(
          { skillKey: normalizedKey, filePath: skillMdPath },
          "skill registry: loaded legacy skill frontmatter with compatibility defaults",
        );
        return compatParsed.data as SkillFrontmatter;
      }
    } catch {
      // Fall through to warn with the original strict-parse error below.
    }

    logger.warn(
      { err: parsed.error, skillKey: normalizedKey, filePath: skillMdPath },
      "skill registry: failed to parse skill frontmatter",
    );
    return null;
  })();

  if (!resolvedFrontmatter) return null;

  // v0: frontmatter.name is the canonical key.
  const fm = resolvedFrontmatter;
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

export async function loadSkillRegistryForWorkspaces(workspaceCwds: string[]): Promise<SkillRegistry> {
  const combined: SkillRegistry = { skillsByName: new Map() };
  const seen = new Set<string>();

  for (const workspaceCwd of workspaceCwds) {
    const resolved = path.resolve(workspaceCwd);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const registry = await loadSkillRegistryForWorkspace(resolved);
    for (const [key, entry] of registry.skillsByName.entries()) {
      combined.skillsByName.set(key, entry);
    }
  }

  return combined;
}

export function buildEmptySkillRegistry(): SkillRegistry {
  return { skillsByName: new Map() };
}

