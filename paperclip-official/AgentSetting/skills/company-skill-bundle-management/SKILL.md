---
name: company-skill-bundle-management
description: >
  Use when managing Paperclip company skill bundles, determining precedence
  among bundled, workspace addon, and company skills, or resolving conflicts
  and scope boundaries in the current skill injection system.
mode: active
prompt: |
  Company Skill Bundle Management ({{skillName}})

  You are handling a skill-management problem inside Paperclip's current skill injection system. Your task is not to discuss skill design in the abstract. Your task is to make executable judgments about injection order, override rules, conflict resolution, and skill boundary discipline.

  Use the following current-system facts as the baseline:

  - bundled skills: skills shipped with a workspace or `AgentSetting` directory and loadable by the workspace registry
  - workspace addon skills: additional skills loaded from a workspace registry and merged into the workspace-side injection flow
  - company skills: skills stored in the company skill bundle; when names collide, they override workspace-origin skills
  - precedence: normalized skill name is the merge key; company skills override workspace-origin skills, and only the last effective version survives
  - mode boundary: `active` skills are injected only on explicit invocation; `passive` skills are injected only when wake hints match and the skill is not marked `internal`
  - prompt boundary: if a skill contains checkpoints, branching, loops, or step outputs, it should not be treated as a fully inline-safe prompt and should instead move toward Company Skills Run or workflow API execution

  ## Required Output Order

  1. Identify the problem type
     - Decide whether this is primarily a source-of-truth problem, precedence problem, same-name conflict, content overlap problem, injection-timing problem, or skill-boundary problem.
     - If information is missing, list the missing conditions first instead of guessing.

  2. Determine source and precedence explicitly
     - State whether the skill belongs to bundled, workspace addon, or company scope.
     - If names collide, state clearly which version will take effect and why.
     - If the issue is not actually precedence, but instead mode, invocation args, wake hints, internal metadata, or character-budget limits, say that directly.

  3. Resolve conflicts
     - For same-name conflicts, prefer one canonical skill instead of allowing long-term divergence between company and workspace layers.
     - For content conflicts, explain which part is a real override, which part is only descriptive drift, and which part should be merged.
     - For behavioral conflicts, decide whether the agent would receive contradictory instructions and propose the smallest viable correction if so.

  4. Enforce skill boundaries
     - A skill should stay focused on one clear capability or decision surface.
     - Do not force orchestration logic, multi-step workflow control, approval chains, or oversized operations manuals into a single inline skill prompt.
     - If the requirement exceeds what a skill should own, recommend converting it into a workflow, Company Skills Run entry point, or a set of smaller skills.

  5. Produce executable conclusions
     - Recommend the correct owner layer: workspace or company.
     - Recommend the canonical name and whether renaming is necessary.
     - Recommend the correct mode (`active` or `passive`) and explain why.
     - State whether the right action is to keep the override, merge, split, or remove.

  ## Output Requirements

  - Separate "current system behavior" from "recommended changes."
  - If precedence is involved, state it directly: "company skills override workspace skills."
  - If a skill did not take effect, check these causes first: normalized name key, mode, invocation args, wake hints, `metadata.internal`, and character budget.
  - Avoid vague principles. Every point must map to actual Paperclip injection behavior.
---

# Company Skill Bundle Management

Use this skill to manage the relationship between company skill bundles and workspace skill injection in Paperclip, especially for same-name overrides, source ownership, injection boundaries, and conflict resolution.

The system has three core rules:

1. `company skills` override `workspace skills` when names collide.
2. `active` and `passive` skills follow different injection rules, so mode must be confirmed before precedence is analyzed.
3. A skill should hold one stable injectable capability; cross-step control logic should be upgraded to a workflow or execution-oriented entry point.
