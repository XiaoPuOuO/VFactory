import { describe, expect, it } from "vitest";
import { safeParseSkillFrontmatterFromMarkdown } from "@paperclipai/shared";
import { getWorkflowTemplates } from "./workflowTemplates";

describe("workflowTemplates", () => {
  it("game_update_qa_deploy template parses as valid skill frontmatter", () => {
    const md = getWorkflowTemplates().find((t) => t.id === "game_update_qa_deploy")?.markdown;
    expect(md).toBeTruthy();
    const r = safeParseSkillFrontmatterFromMarkdown(md!);
    expect(r.success).toBe(true);
  });
});
