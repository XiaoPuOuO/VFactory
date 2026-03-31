import type { OrgNode } from "../api/agents";
import type { Agent } from "@paperclipai/shared";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

/** 避免名稱或文字破壞 Markdown 粗體／行內程式碼 */
export function escapeMarkdownInline(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/`/g, "\\`");
}

/** 匯出用欄位標籤（依介面語系帶入） */
export interface OrgMarkdownLabels {
  fieldTitle: string;
  fieldCapabilities: string;
  emptyCapabilities: string;
}

function formatCapabilitiesText(raw: string | null | undefined, emptyPlaceholder: string): string {
  if (raw == null || raw.trim() === "") return emptyPlaceholder;
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function walkNodes(
  node: OrgNode,
  depth: number,
  lines: string[],
  agentMap: Map<string, Agent>,
  labels: OrgMarkdownLabels,
): void {
  const agent = agentMap.get(node.id);
  const jobTitle = agent?.title?.trim() || roleLabel(node.role);
  const caps = formatCapabilitiesText(agent?.capabilities, labels.emptyCapabilities);

  const ind = "  ".repeat(depth);
  lines.push(`${ind}- **${escapeMarkdownInline(node.name)}**`);
  lines.push(`${ind}  - ${labels.fieldTitle}：${escapeMarkdownInline(jobTitle)}`);
  lines.push(`${ind}  - ${labels.fieldCapabilities}：${escapeMarkdownInline(caps)}`);

  for (const c of node.reports) {
    walkNodes(c, depth + 2, lines, agentMap, labels);
  }
}

export function buildOrgMarkdownExport(params: {
  companyName: string;
  introLine: string;
  hierarchyHeading: string;
  emptyHierarchyNote: string;
  roots: OrgNode[];
  agentMap: Map<string, Agent>;
  labels: OrgMarkdownLabels;
}): string {
  const {
    companyName,
    introLine,
    hierarchyHeading,
    emptyHierarchyNote,
    roots,
    agentMap,
    labels,
  } = params;
  const lines: string[] = [];
  lines.push(`# ${escapeMarkdownInline(companyName)}`);
  lines.push("");
  lines.push(introLine);
  lines.push("");
  lines.push(hierarchyHeading);
  lines.push("");

  if (roots.length === 0) {
    lines.push(`*${escapeMarkdownInline(emptyHierarchyNote)}*`);
  } else {
    for (const r of roots) {
      walkNodes(r, 0, lines, agentMap, labels);
    }
  }

  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function orgMarkdownFilename(companyName: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const slug = companyName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff.-]+/gi, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const safe = slug || "organization";
  return `${safe}-org-${day}.md`;
}
