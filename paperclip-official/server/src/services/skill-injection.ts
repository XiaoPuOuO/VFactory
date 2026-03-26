import type { SkillArgumentDefinition, SkillFrontmatter } from "@paperclipai/shared";
import { loadSkillRegistryForWorkspace } from "./skill-registry.js";
import { logger } from "../middleware/logger.js";

export type SkillInvocationInput = {
  name: string;
  args: string[];
};

function normalizeSkillKey(input: string): string {
  return input.trim().toLowerCase().replace(/_/g, "-");
}

function parseInvocationArray(value: unknown): SkillInvocationInput[] {
  if (!Array.isArray(value)) return [];
  const out: SkillInvocationInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const nameRaw = record.name;
    const argsRaw = record.args;
    if (typeof nameRaw !== "string" || nameRaw.trim().length === 0) continue;
    if (!Array.isArray(argsRaw)) continue;
    const args = argsRaw.filter((a): a is string => typeof a === "string");
    if (args.length === 0 && Object.keys(record).length > 0) {
      // Allow empty args (invocation like "/skill-a"), still keep it.
    }
    out.push({
      name: normalizeSkillKey(nameRaw),
      args: args.map((a) => a),
    });
  }
  return out;
}

function booleanFromToken(token: string): boolean | null {
  const t = token.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "y") return true;
  if (t === "false" || t === "0" || t === "no" || t === "n") return false;
  return null;
}

function resolveArgumentValue(def: SkillArgumentDefinition, token: string | undefined): unknown | null {
  if (token == null) return def.default ?? undefined;

  switch (def.type) {
    case "string":
      return token;
    case "number": {
      const parsed = Number.parseFloat(token);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    }
    case "boolean": {
      const b = booleanFromToken(token);
      return b == null ? null : b;
    }
    case "enum": {
      const lowerToActual = new Map(def.enum.map((v) => [v.toLowerCase(), v]));
      const key = token.trim().toLowerCase();
      return lowerToActual.get(key) ?? null;
    }
    case "json": {
      try {
        return JSON.parse(token);
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

function truncateForPrompt(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + "...";
}

function renderAllowedTemplateVariables(input: string, allowed: Set<string>, values: Record<string, string>): string {
  // v0 renderer: only substitutes `{{var}}` when var is in `allowed`.
  return input.replace(/{{\s*([A-Za-z0-9_-]+)\s*}}/g, (match, varNameRaw: string) => {
    const varName = String(varNameRaw);
    if (!allowed.has(varName)) return match;
    const val = values[varName];
    return val == null ? "" : val;
  });
}

function resolveSkillValues(frontmatter: SkillFrontmatter, invocationArgs: string[] | null): Record<string, string> | null {
  const argDefs = Array.isArray(frontmatter.arguments) ? frontmatter.arguments : [];
  const values: Record<string, string> = {};

  for (let i = 0; i < argDefs.length; i++) {
    const def = argDefs[i]!;
    const token = invocationArgs ? invocationArgs[i] : undefined;
    if (token == null) {
      if (def.required && def.default === undefined) return null;
      const v = def.default;
      if (v !== undefined) {
        values[def.name] = truncateForPrompt(String(v), 1024);
      }
      continue;
    }

    const resolved = resolveArgumentValue(def, token);
    if (resolved == null) return null;

    const str =
      typeof resolved === "string" ? resolved : typeof resolved === "number" || typeof resolved === "boolean" ? String(resolved) : JSON.stringify(resolved);
    if (str.length > 2048) return null;
    values[def.name] = truncateForPrompt(str, 1024);
  }

  return values;
}

function buildSkillPromptForInjection(frontmatter: SkillFrontmatter, values: Record<string, string>): string {
  const allowed = new Set<string>(["companyId", "agentId", "skillName", ...(frontmatter.arguments?.map((a) => a.name) ?? [])]);

  const pieces: string[] = [];
  if (typeof frontmatter.prompt === "string" && frontmatter.prompt.trim().length > 0) {
    pieces.push(renderAllowedTemplateVariables(frontmatter.prompt, allowed, values));
  }
  if (Array.isArray(frontmatter.flow) && frontmatter.flow.length > 0) {
    for (const step of frontmatter.flow) {
      if (step.kind !== "prompt") continue;
      pieces.push(renderAllowedTemplateVariables(step.template, allowed, values));
    }
  }

  return pieces.filter((p) => p.trim().length > 0).join("\n\n");
}

export async function buildSkillInjectionPrompt(args: {
  workspaceCwd: string;
  context: unknown;
  agentId: string;
  companyId: string;
  /**
   * Optional company-level skills already parsed & validated from user-defined bundles.
   * When provided, these skills override workspace skills with the same normalized name.
   */
  companySkills?: SkillFrontmatter[] | null;
  /**
   * 聊天輕量 heartbeat：不注入被動技能、縮小總字元上限，僅處理訊息內 `/skill` 主動引用。
   */
  chatLightMode?: boolean;
}): Promise<string | null> {
  const registry = await loadSkillRegistryForWorkspace(args.workspaceCwd);
  const workspaceByKey = registry.skillsByName;

  const companyByKey = new Map<string, SkillFrontmatter>();
  if (Array.isArray(args.companySkills)) {
    for (const fm of args.companySkills) {
      const key = normalizeSkillKey(fm.name);
      companyByKey.set(key, fm);
    }
  }

  // Merge with precedence: company overrides workspace.
  const combinedByKey = new Map<string, { name: string; frontmatter: SkillFrontmatter }>();
  for (const [key, entry] of workspaceByKey.entries()) {
    combinedByKey.set(key, { name: entry.name, frontmatter: entry.frontmatter });
  }
  for (const [key, fm] of companyByKey.entries()) {
    combinedByKey.set(key, { name: key, frontmatter: fm });
  }

  const all = Array.from(combinedByKey.values());
  if (all.length === 0) return null;

  const passiveSkillsAll = all
    .filter((e) => e.frontmatter.mode === "passive")
    .sort((a, b) => a.name.localeCompare(b.name));
  /** 聊天輕量模式省略被動技能注入以節省 prompt。 */
  const passiveSkills = args.chatLightMode ? [] : passiveSkillsAll;

  const invocations = parseInvocationArray((args.context as Record<string, unknown> | null | undefined)?.skillInvocations);
  // Active: keep last invocation per skill name (deterministic).
  const lastByName = new Map<string, SkillInvocationInput>();
  for (const inv of invocations) lastByName.set(inv.name, inv);
  const activeInvocations = Array.from(lastByName.values());

  const activeSkills: Array<{ entry: (typeof all)[number]; invocation: SkillInvocationInput }> = [];
  for (const inv of activeInvocations) {
    const entry = combinedByKey.get(inv.name);
    if (!entry) continue;
    if (entry.frontmatter.mode !== "active") continue;
    activeSkills.push({ entry, invocation: inv });
  }

  if (passiveSkills.length === 0 && activeSkills.length === 0) return null;

  const MAX_CHARS = args.chatLightMode ? 6000 : 16_000;
  const sections: string[] = [];
  sections.push("Skill injection context (Paperclip):");
  sections.push("Follow the injected skill instructions. Active skills are injected only when explicitly invoked.");

  const companyIdStr = String(args.companyId);
  const agentIdStr = String(args.agentId);

  const addSection = (section: string) => {
    if (sections.join("\n").length + section.length + 1 > MAX_CHARS) return false;
    sections.push(section);
    return true;
  };

  if (passiveSkills.length > 0) {
    const passiveHeader = "## Passive Skills";
    if (!addSection(passiveHeader)) return null;

    for (const entry of passiveSkills) {
      const values = resolveSkillValues(entry.frontmatter, null);
      if (!values) {
        logger.warn({ skill: entry.name, agentId: args.agentId }, "skill injection: passive skill requires missing required args; skipping");
        continue;
      }
      const renderValues = { ...values, companyId: companyIdStr, agentId: agentIdStr, skillName: entry.name };
      const content = buildSkillPromptForInjection(entry.frontmatter, renderValues);
      if (!content.trim()) continue;
      if (!addSection(`### Passive Skill: ${entry.name}\n${content}`)) break;
    }
  }

  if (activeSkills.length > 0) {
    const activeHeader = "## Active Skills";
    if (!addSection(activeHeader)) return null;

    const activeSorted = activeSkills.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
    for (const { entry, invocation } of activeSorted) {
      const values = resolveSkillValues(entry.frontmatter, invocation.args);
      if (!values) {
        logger.warn(
          { skill: entry.name, agentId: args.agentId, invocationArgs: invocation.args },
          "skill injection: active skill args invalid; skipping",
        );
        continue;
      }
      const renderValues = { ...values, companyId: companyIdStr, agentId: agentIdStr, skillName: entry.name };
      const content = buildSkillPromptForInjection(entry.frontmatter, renderValues);
      if (!content.trim()) continue;
      if (!addSection(`### Active Skill: ${entry.name}\n${content}`)) break;
    }
  }

  return sections.join("\n");
}

