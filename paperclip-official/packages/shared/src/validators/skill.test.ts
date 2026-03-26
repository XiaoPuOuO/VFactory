import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  extractSkillFrontmatterYaml,
  parseSkillFrontmatterFromMarkdown,
  safeParseSkillFrontmatterFromMarkdown,
} from "./skill.js";

describe("Skill v0 frontmatter schema", () => {
  it("parses valid frontmatter with prompt + arguments", () => {
    const markdown = `---
name: example-skill
description: Test skill
mode: active
arguments:
  - name: target
    type: string
    required: true
    description: what to do
  - name: level
    type: enum
    enum: [low, medium, high]
    default: medium
prompt: |
  Target: {{target}}
flow:
  - kind: prompt
    template: |
      Level: {{level}}
---
# body
`;

    const fm = parseSkillFrontmatterFromMarkdown(markdown);
    expect(fm.name).toBe("example-skill");
    expect(fm.mode).toBe("active");
    expect(fm.arguments?.length).toBe(2);
    expect(fm.prompt?.trim().startsWith("Target:")).toBe(true);
    expect(fm.flow?.[0] && fm.flow[0].kind).toBe("prompt");
  });

  it("extracts YAML frontmatter text", () => {
    const markdown = `---
name: example-skill
description: Test skill
mode: passive
prompt: hello
---
body`;
    const yamlText = extractSkillFrontmatterYaml(markdown);
    expect(yamlText).toContain("name: example-skill");
    expect(yamlText).toContain("mode: passive");
  });

  it("fails when required fields are missing", () => {
    const markdown = `---
name: example-skill
description: Test skill
prompt: hello
---`;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(String(parsed.error)).toMatch(/mode/i);
  });

  it("fails when enum default is not in enum values", () => {
    const markdown = `---
name: example-skill
description: Test skill
mode: active
arguments:
  - name: level
    type: enum
    enum: [low, medium]
    default: high
prompt: hello
---`;

    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message =
        parsed.error instanceof ZodError ? parsed.error.issues?.[0]?.message ?? String(parsed.error) : String(parsed.error);
      expect(message.toLowerCase()).toContain("default");
    }
  });

  it("fails when both prompt and flow are missing", () => {
    const markdown = `---
name: example-skill
description: Test skill
mode: active
arguments: []
---`;

    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(false);
  });

  it("rejects non-plain YAML tags (security hardening)", () => {
    const markdown = `---
name: !!js/function >-
  function () { return "example-skill"; }
description: Test skill
mode: active
prompt: hello
arguments: []
---`;

    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(false);
  });
});

