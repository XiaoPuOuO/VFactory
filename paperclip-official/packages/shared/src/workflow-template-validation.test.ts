import { describe, expect, it } from "vitest";
import { parseSkillFrontmatterFromMarkdown } from "./validators/skill.js";
import {
  collectRegisteredTemplateKeysFromFrontmatter,
  extractWorkflowTemplatePlaceholders,
  validateWorkflowFrontmatterTemplatePlaceholders,
} from "./workflow-template-validation.js";

describe("workflow-template-validation", () => {
  it("extractWorkflowTemplatePlaceholders finds {{var}} tokens", () => {
    expect(extractWorkflowTemplatePlaceholders("a {{x}} b {{ y_2 }}")).toEqual(["x", "y_2"]);
  });

  it("validateWorkflowFrontmatterTemplatePlaceholders accepts game_update_qa_deploy style chain", () => {
    const fm = parseSkillFrontmatterFromMarkdown(`---
name: game-delivery-pipeline
description: Test
mode: active
arguments:
  - name: project_name
    type: string
    required: false
flow:
  - kind: prompt
    id: gu-spec
    template: |
      {{project_name}}
    output: gu_design_doc
  - kind: prompt
    id: gu-build
    template: |
      {{gu_design_doc}}
    depends_on: [gu-spec]
    output: gu_impl_summary
  - kind: condition
    id: gu-gate
    condition: "{{gu_impl_summary}} contains 'OK'"
    if_true: gu-deploy
    if_false: gu-fix
    depends_on: [gu-build]
  - kind: prompt
    id: gu-deploy
    template: "ok"
    depends_on: [gu-gate]
  - kind: prompt
    id: gu-fix
    template: "fix"
    depends_on: [gu-gate]
---
`);
    const v = validateWorkflowFrontmatterTemplatePlaceholders(fm);
    expect(v.ok).toBe(true);
  });

  it("collectRegisteredTemplateKeysFromFrontmatter includes args and outputs", () => {
    const fm = parseSkillFrontmatterFromMarkdown(`---
name: t
description: d
mode: active
arguments:
  - name: project_name
    type: string
flow:
  - kind: prompt
    id: a
    template: "x"
    output: o1
---
`);
    const keys = collectRegisteredTemplateKeysFromFrontmatter(fm);
    expect(keys.has("project_name")).toBe(true);
    expect(keys.has("o1")).toBe(true);
    expect(keys.has("companyId")).toBe(true);
  });
});
