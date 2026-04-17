import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillInvocations } from "../services/skill-invocation-parser.js";
import { buildSkillInjectionPrompt, buildWakeContextHaystack } from "../services/skill-injection.js";
import { parseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill(tmpRoot: string, skillDirName: string, skillMarkdown: string): Promise<void> {
  const dirPath = path.join(tmpRoot, "AgentSetting", "skills", skillDirName);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, "SKILL.md"), skillMarkdown, "utf8");
}

describe("Skill system v0 (parser + injection)", () => {
  it("buildWakeContextHaystack lowercases wake fields", () => {
    const h = buildWakeContextHaystack({
      wakeReason: "Chat_Direct",
      wakeReasonLabel: "label",
      source: "x",
    });
    expect(h).toContain("chat_direct");
    expect(h).toContain("label");
  });

  it("filters passive skills when metadata.passiveWakeHints is set and no match", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-hints-");
    try {
      await writeSkill(
        tmpRoot,
        "passive-always",
        `---
name: passive-always
description: always
mode: passive
arguments:
  - name: x
    type: string
    default: a
prompt: |
  ALWAYS
---
`,
      );
      await writeSkill(
        tmpRoot,
        "passive-hinted",
        `---
name: passive-hinted
description: hinted
mode: passive
metadata:
  passiveWakeHints:
    - "issue_assigned"
arguments:
  - name: x
    type: string
    default: a
prompt: |
  HINTED
---
`,
      );

      const noMatch = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: { wakeReason: "chat_message" },
      });
      expect(noMatch).not.toBeNull();
      expect(noMatch ?? "").toContain("passive-always");
      expect(noMatch ?? "").not.toContain("passive-hinted");

      const matched = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: { wakeReason: "issue_assigned" },
      });
      expect(matched ?? "").toContain("passive-hinted");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("parses slash line when editor encodes trailing space as &#x20;", () => {
    const text = "/code-review-sop&#x20;";
    const invocations = parseSkillInvocations(text);
    expect(invocations.length).toBe(1);
    expect(invocations[0]!.name).toBe("code-review-sop");
    expect(invocations[0]!.args).toEqual([]);
  });

  it("parses /skillname invocations line-by-line with quoted args", () => {
    const text = `請先處理
/active-test "hello world" high
/passive-test
其他文字`;
    const invocations = parseSkillInvocations(text);
    expect(invocations.length).toBe(2);
    expect(invocations[0]!.name).toBe("active-test");
    expect(invocations[0]!.args).toEqual(["hello world", "high"]);
    expect(invocations[1]!.name).toBe("passive-test");
    expect(invocations[1]!.args).toEqual([]);
  });

  it("injects passive skills always, and injects active skills only when invoked", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-sys-");
    try {
      await writeSkill(
        tmpRoot,
        "passive-test",
        `---
name: passive-test
description: passive test
mode: passive
arguments:
  - name: x
    type: string
    default: defaultX
  - name: y
    type: number
    default: 7
prompt: |
  Passive x={{x}} y={{y}} company={{companyId}} agent={{agentId}} skill={{skillName}}
---
body
`,
      );
      await writeSkill(
        tmpRoot,
        "active-test",
        `---
name: active-test
description: active test
mode: active
arguments:
  - name: arg1
    type: string
    required: true
  - name: level
    type: enum
    enum: [low, high]
    required: true
prompt: |
  Active arg1={{arg1}} level={{level}}
---
body
`,
      );

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: {
          skillInvocations: [
            { name: "active-test", args: ["hello", "HIGH"] },
          ],
        },
      });

      expect(injection).not.toBeNull();
      const textOut = injection ?? "";
      expect(textOut).toContain("## Passive Skills");
      expect(textOut).toContain("### Passive Skill: passive-test");
      expect(textOut).toContain("x=defaultX");
      expect(textOut).toContain("y=7");
      expect(textOut).toContain("company=company-1");
      expect(textOut).toContain("agent=agent-1");
      expect(textOut).toContain("skill=passive-test");

      expect(textOut).toContain("## Active Skills");
      expect(textOut).toContain("### Active Skill: active-test");
      expect(textOut).toContain("arg1=hello");
      expect(textOut).toContain("level=high");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("skips active skill when invocation args fail validation", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-sys-invalid-");
    try {
      await writeSkill(
        tmpRoot,
        "passive-test",
        `---
name: passive-test
description: passive test
mode: passive
arguments:
  - name: x
    type: string
    default: defaultX
prompt: |
  Passive x={{x}}
---
body
`,
      );
      await writeSkill(
        tmpRoot,
        "active-test",
        `---
name: active-test
description: active test
mode: active
arguments:
  - name: arg1
    type: string
    required: true
  - name: level
    type: enum
    enum: [low, high]
    required: true
prompt: |
  Active arg1={{arg1}} level={{level}}
---
body
`,
      );

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: {
          skillInvocations: [
            { name: "active-test", args: ["hello", "wrong"] },
          ],
        },
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("## Passive Skills");
      expect(textOut).toContain("### Passive Skill: passive-test");
      expect(textOut).not.toContain("### Active Skill: active-test");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("company skills override workspace skills with the same name", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-sys-override-");
    try {
      await writeSkill(
        tmpRoot,
        "shared-passive",
        `---
name: shared-passive
description: workspace passive
mode: passive
prompt: |
  Workspace passive company={{companyId}} agent={{agentId}}
---
body
`,
      );
      await writeSkill(
        tmpRoot,
        "shared-active",
        `---
name: shared-active
description: workspace active
mode: active
arguments:
  - name: arg1
    type: string
    required: true
prompt: |
  Workspace active arg1={{arg1}}
---
body
`,
      );

      const companyPassiveFm = parseSkillFrontmatterFromMarkdown(`---
name: shared-passive
description: company passive
mode: passive
prompt: |
  Company passive company={{companyId}} agent={{agentId}}
---
body
`);
      const companyActiveFm = parseSkillFrontmatterFromMarkdown(`---
name: shared-active
description: company active
mode: active
arguments:
  - name: arg1
    type: string
    required: true
prompt: |
  Company active arg1={{arg1}}
---
body
`);

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: {
          skillInvocations: [{ name: "shared-active", args: ["hello"] }],
        },
        companySkills: [companyPassiveFm, companyActiveFm],
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("## Passive Skills");
      expect(textOut).toContain("### Passive Skill: shared-passive");
      expect(textOut).toContain("Company passive company=company-1 agent=agent-1");
      expect(textOut).not.toContain("Workspace passive company=company-1 agent=agent-1");

      expect(textOut).toContain("## Active Skills");
      expect(textOut).toContain("### Active Skill: shared-active");
      expect(textOut).toContain("Company active arg1=hello");
      expect(textOut).not.toContain("Workspace active arg1=hello");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("bundled governance skills are always injected before project workspace add-ons", async () => {
    const bundledRoot = await makeTempDir("paperclip-skill-bundled-");
    const workspaceRoot = await makeTempDir("paperclip-skill-workspace-");
    try {
      await writeSkill(
        bundledRoot,
        "bundled-passive",
        `---
name: bundled-passive
description: bundled passive
mode: passive
prompt: |
  Bundled passive company={{companyId}} agent={{agentId}}
---
body
`,
      );
      await writeSkill(
        bundledRoot,
        "shared-passive",
        `---
name: shared-passive
description: bundled shared
mode: passive
prompt: |
  Bundled shared company={{companyId}} agent={{agentId}}
---
body
`,
      );
      await writeSkill(
        workspaceRoot,
        "workspace-passive",
        `---
name: workspace-passive
description: workspace passive
mode: passive
prompt: |
  Workspace passive company={{companyId}} agent={{agentId}}
---
body
`,
      );
      await writeSkill(
        workspaceRoot,
        "shared-passive",
        `---
name: shared-passive
description: workspace shared
mode: passive
prompt: |
  Workspace shared company={{companyId}} agent={{agentId}}
---
body
`,
      );

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: workspaceRoot,
        governanceWorkspaceCwds: [bundledRoot, workspaceRoot],
        agentId: "agent-1",
        companyId: "company-1",
        context: { wakeReason: "chat_message" },
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("Bundled passive company=company-1 agent=agent-1");
      expect(textOut).toContain("Workspace passive company=company-1 agent=agent-1");
      expect(textOut).toContain("Workspace shared company=company-1 agent=agent-1");
      expect(textOut).not.toContain("Bundled shared company=company-1 agent=agent-1");
    } finally {
      await fs.rm(bundledRoot, { recursive: true, force: true });
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("injects a lightweight available-skills catalog in chat light mode", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-chat-light-");
    try {
      await writeSkill(
        tmpRoot,
        "passive-catalog",
        `---
name: passive-catalog
description: passive catalog skill
mode: passive
prompt: |
  Passive catalog company={{companyId}} agent={{agentId}}
---
body
`,
      );
      await writeSkill(
        tmpRoot,
        "active-catalog",
        `---
name: active-catalog
description: active catalog skill
mode: active
arguments: []
prompt: |
  Active catalog
---
body
`,
      );

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: { wakeReason: "chat_message" },
        chatLightMode: true,
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("## Available Skills");
      expect(textOut).toContain("- active-catalog: active catalog skill");
      expect(textOut).toContain("- passive-catalog: passive catalog skill");
      expect(textOut).not.toContain("## Passive Skills");
      expect(textOut).not.toContain("Passive catalog company=company-1 agent=agent-1");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("keeps a partial available-skills catalog when chat light catalog exceeds max length", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-catalog-truncate-");
    try {
      for (let index = 0; index < 120; index += 1) {
        const suffix = String(index).padStart(3, "0");
        await writeSkill(
          tmpRoot,
          `catalog-${suffix}`,
          `---
name: catalog-${suffix}
description: This is a deliberately long catalog description for skill ${suffix} so the chat-light catalog exceeds the maximum prompt budget and must be truncated safely without disappearing entirely.
mode: active
arguments: []
prompt: |
  Catalog skill ${suffix}
---
body
`,
        );
      }

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: { wakeReason: "chat_message" },
        chatLightMode: true,
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("## Available Skills");
      expect(textOut).toContain("- catalog-000:");
      expect(textOut).toContain("- catalog-050:");
      expect(textOut.length).toBeLessThanOrEqual(20_000);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("includes later official skills in chat light catalog after compression", async () => {
    const paperclipOfficialRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const injection = await buildSkillInjectionPrompt({
      workspaceCwd: paperclipOfficialRoot,
      agentId: "agent-1",
      companyId: "company-1",
      context: { wakeReason: "chat_message" },
      chatLightMode: true,
    });

    const textOut = injection ?? "";
    expect(textOut).toContain("## Available Skills");
    expect(textOut).toContain("- django-tdd:");
    expect(textOut).toContain("- para-memory-files:");
    expect(textOut.length).toBeLessThanOrEqual(20_000);
  });

  it("injects workflow notice when skill uses checkpoint / branching flow", async () => {
    const tmpRoot = await makeTempDir("paperclip-skill-workflow-");
    try {
      await writeSkill(
        tmpRoot,
        "wf-test",
        `---
name: wf-test
description: workflow test
mode: active
arguments: []
flow:
  - id: a
    kind: prompt
    template: |
      Step A
    output: outA
  - id: c
    kind: checkpoint
    message: "Check {{outA}}"
    on_approve: b
    on_reject: a
    depends_on: [a]
  - id: b
    kind: prompt
    template: |
      Step B
    depends_on: [c]
---
`,
      );

      const injection = await buildSkillInjectionPrompt({
        workspaceCwd: tmpRoot,
        agentId: "agent-1",
        companyId: "company-1",
        context: {
          skillInvocations: [{ name: "wf-test", args: [] }],
        },
      });

      const textOut = injection ?? "";
      expect(textOut).toContain("### Active Skill: wf-test");
      expect(textOut).toContain("[Workflow skill");
      expect(textOut).toContain("Company Skills");
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it("parses and injects uiux-inspection skill from repo AgentSetting", async () => {
    const paperclipOfficialRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const injection = await buildSkillInjectionPrompt({
      workspaceCwd: paperclipOfficialRoot,
      agentId: "agent-1",
      companyId: "company-1",
      context: {
        skillInvocations: [{ name: "uiux-inspection", args: [] }],
      },
    });

    expect(injection).not.toBeNull();
    const textOut = injection ?? "";
      expect(textOut).toContain("UI/UX Inspection");
      expect(textOut).toContain("## 1. Goal And User Assumptions");
  });
});

