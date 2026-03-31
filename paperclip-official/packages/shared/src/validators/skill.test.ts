import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  extractSkillFrontmatterYaml,
  parseSkillFrontmatterFromMarkdown,
  safeParseSkillFrontmatterFromMarkdown,
  safeParseSkillFrontmatterFromMarkdownForFlowEditor,
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
    if (fm.flow?.[0] && fm.flow[0].kind === "prompt") {
      expect(fm.flow[0].id).toBe("default-prompt");
    }
  });

  it("accepts steps alias and prompt alias on flow prompt steps", () => {
    const markdown = `---
name: alias-skill
description: alias test
mode: active
steps:
  - kind: prompt
    prompt: |
      Hello {{companyId}}
---
`;
    const fm = parseSkillFrontmatterFromMarkdown(markdown);
    expect(fm.flow?.[0]?.kind).toBe("prompt");
    if (fm.flow?.[0]?.kind === "prompt") {
      expect(fm.flow[0].template.trim().startsWith("Hello")).toBe(true);
    }
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

  it("accepts prompt with require_human_input false", () => {
    const markdown = `---
name: auto-prompt-skill
description: auto prompt
mode: active
flow:
  - kind: prompt
    id: p1
    template: "Hello"
    output: out1
    require_human_input: false
---
`;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const p = parsed.data.flow?.[0];
    expect(p?.kind).toBe("prompt");
    if (p?.kind === "prompt") {
      expect(p.require_human_input).toBe(false);
      expect(p.template).toBe("Hello");
    }
  });

  it("accepts checkpoint with require_human_confirm false (auto-approve)", () => {
    const markdown = `---
name: auto-cp-skill
description: auto checkpoint
mode: active
flow:
  - kind: prompt
    id: a
    template: "step a"
  - kind: checkpoint
    id: cp
    message: "OK?"
    on_approve: b
    on_reject: a
    require_human_confirm: false
  - kind: prompt
    id: b
    template: "step b"
---
`;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const cp = parsed.data.flow?.find((s) => s.kind === "checkpoint");
    expect(cp?.kind).toBe("checkpoint");
    if (cp?.kind === "checkpoint") {
      expect(cp.require_human_confirm).toBe(false);
    }
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

  it("strict parse rejects non-kebab name; flow editor parse accepts for live sync", () => {
    const markdown = `---
name: FooBar
description: Test
mode: active
flow:
  - kind: prompt
    id: p1
    template: "Hello"
---`;

    const strict = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(strict.success).toBe(false);

    const forEditor = safeParseSkillFrontmatterFromMarkdownForFlowEditor(markdown);
    expect(forEditor.success).toBe(true);
    if (forEditor.success) {
      expect(forEditor.data.name).toBe("FooBar");
      expect(forEditor.data.flow?.[0]?.kind).toBe("prompt");
    }
  });

  it("strict parse rejects empty name; flow editor parse accepts for live sync", () => {
    const markdown = `---
name: ""
description: Test
mode: active
flow:
  - kind: prompt
    id: p1
    template: "Hello"
---`;

    const strict = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(strict.success).toBe(false);

    const forEditor = safeParseSkillFrontmatterFromMarkdownForFlowEditor(markdown);
    expect(forEditor.success).toBe(true);
    if (forEditor.success) {
      expect(forEditor.data.name).toBe("");
    }
  });

  it("strict parse rejects empty description; flow editor parse accepts for live sync", () => {
    const markdown = `---
name: ok-skill
description: ""
mode: active
flow:
  - kind: prompt
    id: p1
    template: "Hello"
---`;

    const strict = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(strict.success).toBe(false);

    const forEditor = safeParseSkillFrontmatterFromMarkdownForFlowEditor(markdown);
    expect(forEditor.success).toBe(true);
    if (forEditor.success) {
      expect(forEditor.data.description).toBe("");
    }
  });

  it("accepts invoke_workflow step in flow", () => {
    const markdown = `---
name: parent-skill
description: Parent
mode: active
flow:
  - kind: invoke_workflow
    id: inv-1
    skill_key: child-skill
    output: child_out
---
`;
    const fm = parseSkillFrontmatterFromMarkdown(markdown);
    expect(fm.flow?.[0]?.kind).toBe("invoke_workflow");
    if (fm.flow?.[0]?.kind === "invoke_workflow") {
      expect(fm.flow[0].skill_key).toBe("child-skill");
      expect(fm.flow[0].output).toBe("child_out");
    }
  });

  it("rejects flow templates with unknown {{placeholder}}", () => {
    const markdown = `---
name: bad-placeholder
description: Test
mode: active
flow:
  - kind: prompt
    id: p1
    template: "Hello {{not_registered}}"
---
`;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(false);
  });

  it("accepts {{step_output}} when output is declared on a prior prompt step", () => {
    const markdown = `---
name: ok-chain
description: Test
mode: active
flow:
  - kind: prompt
    id: a
    template: "A"
    output: doc
  - kind: prompt
    id: b
    template: "{{doc}}"
    depends_on: [a]
---
`;
    const parsed = safeParseSkillFrontmatterFromMarkdown(markdown);
    expect(parsed.success).toBe(true);
  });

  it("parses argument label for display", () => {
    const markdown = `---
name: labeled-arg
description: Test
mode: active
arguments:
  - name: project_name
    label: 目標專案名稱
    type: string
    required: false
flow:
  - kind: prompt
    id: p1
    template: "{{project_name}}"
---
`;
    const fm = parseSkillFrontmatterFromMarkdown(markdown);
    expect(fm.arguments?.[0]?.label).toBe("目標專案名稱");
  });
});

