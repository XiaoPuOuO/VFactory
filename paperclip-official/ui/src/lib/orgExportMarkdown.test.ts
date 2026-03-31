// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { OrgNode } from "../api/agents";
import type { Agent } from "@paperclipai/shared";
import {
  buildOrgMarkdownExport,
  escapeMarkdownInline,
  orgMarkdownFilename,
} from "./orgExportMarkdown";

const labels = {
  fieldTitle: "職稱",
  fieldCapabilities: "能力描述",
  emptyCapabilities: "—",
};

describe("escapeMarkdownInline", () => {
  it("escapes asterisk underscore backslash backtick", () => {
    expect(escapeMarkdownInline("a*b_c`")).toBe("a\\*b\\_c\\`");
  });

  it("leaves CJK untouched", () => {
    expect(escapeMarkdownInline("執行長")).toBe("執行長");
  });
});

describe("buildOrgMarkdownExport", () => {
  it("renders name, title, capabilities without adapter or status", () => {
    const roots: OrgNode[] = [
      {
        id: "1",
        name: "Root",
        role: "ceo",
        status: "active",
        autoPaused: false,
        autoPauseReason: null,
        reports: [
          {
            id: "2",
            name: "Child",
            role: "engineer",
            status: "idle",
            autoPaused: false,
            autoPauseReason: null,
            reports: [],
          },
        ],
      },
    ];
    const agent1: Agent = {
      id: "1",
      companyId: "c1",
      name: "Root",
      role: "ceo",
      title: "Chief Exec",
      capabilities: "Strategy",
      status: "active",
      adapterType: "cursor",
    } as Agent;
    const agent2: Agent = {
      id: "2",
      companyId: "c1",
      name: "Child",
      role: "engineer",
      title: "Engineer",
      capabilities: null,
      status: "idle",
      adapterType: "cursor",
    } as Agent;
    const agentMap = new Map<string, Agent>([
      ["1", agent1],
      ["2", agent2],
    ]);
    const md = buildOrgMarkdownExport({
      companyName: "Acme",
      introLine: "> intro",
      hierarchyHeading: "## H",
      emptyHierarchyNote: "empty",
      roots,
      agentMap,
      labels,
    });
    expect(md).toContain("# Acme");
    expect(md).toContain("- **Root**");
    expect(md).toContain("職稱：Chief Exec");
    expect(md).toContain("能力描述：Strategy");
    expect(md).toContain("  - **Child**");
    expect(md).toContain("能力描述：—");
    expect(md).not.toMatch(/cursor|Cursor|adapter/i);
    expect(md).not.toContain("active");
    expect(md).not.toContain("idle");
  });
});

describe("orgMarkdownFilename", () => {
  it("includes date and slug", () => {
    const f = orgMarkdownFilename("My 公司");
    expect(f).toMatch(/-org-\d{4}-\d{2}-\d{2}\.md$/);
    expect(f).toContain("My");
  });
});
