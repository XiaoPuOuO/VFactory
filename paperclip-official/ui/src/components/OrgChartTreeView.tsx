import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { ChevronRight } from "lucide-react";
import type { OrgNode } from "../api/agents";
import { AgentIcon } from "./AgentIconPicker";
import { StatusBadge } from "./StatusBadge";
import { agentUrl } from "../lib/utils";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import "./OrgChartTreeView.css";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  claude_remote: "Claude",
  codex_local: "Codex",
  codex_remote: "Codex",
  gemini_local: "Gemini",
  gemini_remote: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

function OrgChartTreeBranch({
  nodes,
  depth,
  agentMap,
}: {
  nodes: OrgNode[];
  depth: number;
  agentMap: Map<string, Agent>;
}) {
  return (
    <div className="org-chart-tree-children">
      {nodes.map((node) => (
        <OrgChartTreeRow key={node.id} node={node} depth={depth} agentMap={agentMap} />
      ))}
    </div>
  );
}

function OrgChartTreeRow({
  node,
  depth,
  agentMap,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
}) {
  const { t } = useTranslation("org");
  const [expanded, setExpanded] = useState(true);
  const agent = agentMap.get(node.id);
  const hasChildren = node.reports.length > 0;
  const href = agent ? agentUrl(agent) : `/agents/${node.id}`;

  return (
    <div className="org-chart-tree-node">
      <Link
        to={href}
        className="org-chart-tree-row"
        style={{ paddingLeft: `${depth * 18 + 10}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`org-chart-tree-toggle ${expanded ? "expanded" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            aria-expanded={expanded}
            aria-label={expanded ? t("collapseSubtree") : t("expandSubtree")}
          >
            <ChevronRight />
          </button>
        ) : (
          <span className="org-chart-tree-toggle-spacer" aria-hidden />
        )}
        <div className="org-chart-tree-avatar-wrap">
          <div className="org-chart-tree-avatar">
            <AgentIcon icon={agent?.icon} />
          </div>
        </div>
        <span className="org-chart-tree-dot" data-status={node.status} />
        <span className="org-chart-tree-name">{node.name}</span>
        <span className="org-chart-tree-title">
          {agent?.title ?? roleLabel(node.role)}
        </span>
        {agent && (
          <span className="org-chart-tree-adapter">
            {adapterLabels[agent.adapterType] ?? agent.adapterType}
          </span>
        )}
        <StatusBadge
          status={node.status}
          autoPauseReason={node.autoPaused ? node.autoPauseReason ?? undefined : undefined}
        />
      </Link>
      {hasChildren && expanded ? (
        <OrgChartTreeBranch nodes={node.reports} depth={depth + 1} agentMap={agentMap} />
      ) : null}
    </div>
  );
}

export function OrgChartTreeView({
  nodes,
  agentMap,
}: {
  nodes: OrgNode[];
  agentMap: Map<string, Agent>;
}) {
  return (
    <div className="org-chart-tree-root">
      <OrgChartTreeBranch nodes={nodes} depth={0} agentMap={agentMap} />
    </div>
  );
}
