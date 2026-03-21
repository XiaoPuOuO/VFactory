import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { relativeTime, agentRouteRef, agentUrl } from "../lib/utils";
import "./Agents.css";
import { getAgentModelId, getModelOptionsFromAgents } from "../lib/agent-utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot, Plus, List, GitBranch, SlidersHorizontal } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import type { AgentWithPauseReason } from "../api/agents";

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

type FilterTab = "all" | "active" | "paused" | "error";

function matchesFilter(status: string, tab: FilterTab, showTerminated: boolean): boolean {
  if (status === "terminated") return showTerminated;
  if (tab === "all") return true;
  if (tab === "active") return status === "active" || status === "running" || status === "idle";
  if (tab === "paused") return status === "paused";
  if (tab === "error") return status === "error";
  return true;
}

function filterAgents(
  agents: Agent[],
  tab: FilterTab,
  showTerminated: boolean,
  modelFilter: string | null
): Agent[] {
  return agents.filter((a) => {
    if (!matchesFilter(a.status, tab, showTerminated)) return false;
    if (modelFilter !== null && getAgentModelId(a) !== modelFilter) return false;
    return true;
  });
}

function filterOrgTree(
  nodes: OrgNode[],
  tab: FilterTab,
  showTerminated: boolean,
  agentMap: Map<string, Agent>,
  modelFilter: string | null
): OrgNode[] {
  return nodes.reduce<OrgNode[]>((acc, node) => {
    const filteredReports = filterOrgTree(node.reports, tab, showTerminated, agentMap, modelFilter);
    const agent = agentMap.get(node.id);
    const statusOk = matchesFilter(node.status, tab, showTerminated);
    const modelOk = modelFilter === null || (agent && getAgentModelId(agent) === modelFilter);
    if ((statusOk && modelOk) || filteredReports.length > 0) {
      acc.push({ ...node, reports: filteredReports });
    }
    return acc;
  }, []);
}

export function Agents() {
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const pathSegment = location.pathname.split("/").pop() ?? "all";
  const tab: FilterTab = (pathSegment === "all" || pathSegment === "active" || pathSegment === "paused" || pathSegment === "error") ? pathSegment : "all";
  const [view, setView] = useState<"list" | "org">("org");
  const forceListView = isMobile;
  const effectiveView: "list" | "org" = forceListView ? "list" : view;
  const [showTerminated, setShowTerminated] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const modelFilter = searchParams.has("model") ? (searchParams.get("model") ?? "") : null;
  const setModelFilter = useCallback(
    (v: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (v === null) next.delete("model");
        else next.set("model", v);
        return next;
      });
    },
    [setSearchParams]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: agents, isLoading, error } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: orgTree } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "org",
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  // Map agentId -> first live run + live run count
  const liveRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; liveCount: number }>();
    for (const r of runs ?? []) {
      if (r.status !== "running" && r.status !== "queued") continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.liveCount += 1;
        continue;
      }
      map.set(r.agentId, { runId: r.id, liveCount: 1 });
    }
    return map;
  }, [runs]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  /** 目前有被 Agent 使用的模型選項（與 Configuration 頁的模型一致，僅顯示實際在用的）。 */
  const modelOptions = useMemo(
    () => getModelOptionsFromAgents(agents ?? []),
    [agents]
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to view agents." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered = filterAgents(agents ?? [], tab, showTerminated, modelFilter);
  const filteredOrg = filterOrgTree(orgTree ?? [], tab, showTerminated, agentMap, modelFilter);

  return (
    <div className="agents-page">
      <div className="agents-header">
        <Tabs value={tab} onValueChange={(v) => navigate(`/agents/${v}`)}>
          <PageTabBar
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "error", label: "Error" },
            ]}
            value={tab}
            onValueChange={(v) => navigate(`/agents/${v}`)}
          />
        </Tabs>
        <div className="agents-header-actions">
          <div className="relative">
            <button
              className={`agents-filters-trigger ${filtersOpen || showTerminated || modelFilter !== null ? "active" : ""}`}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal />
              Filters
              {(showTerminated || modelFilter !== null) && (
                <span className="agents-filters-badge">
                  {[showTerminated, modelFilter !== null].filter(Boolean).length}
                </span>
              )}
            </button>
            {filtersOpen && (
              <div className="agents-filters-dropdown">
                <div className="agents-filters-dropdown-label">Model</div>
                <button
                  className={`agents-filters-dropdown-item ${modelFilter === null ? "active" : ""}`}
                  onClick={() => { setModelFilter(null); }}
                >
                  All models
                </button>
                {modelOptions.map((opt) => (
                  <button
                    key={opt.id === "" ? "__default__" : opt.id}
                    className={`agents-filters-dropdown-item truncate ${modelFilter === opt.id ? "active" : ""}`}
                    onClick={() => setModelFilter(opt.id)}
                  >
                    <span title={opt.id || "Default"}>{opt.label}</span>
                  </button>
                ))}
                <div className="agents-filters-divider" />
                <button
                  className="agents-filters-checkbox-row"
                  onClick={() => setShowTerminated(!showTerminated)}
                >
                  <span className={`agents-filters-checkbox ${showTerminated ? "checked" : ""}`}>
                    {showTerminated && <span>&#10003;</span>}
                  </span>
                  Show terminated
                </button>
              </div>
            )}
          </div>
          {!forceListView && (
            <div className="agents-view-toggle">
              <button
                className={effectiveView === "list" ? "active" : ""}
                onClick={() => setView("list")}
              >
                <List />
              </button>
              <button
                className={effectiveView === "org" ? "active" : ""}
                onClick={() => setView("org")}
              >
                <GitBranch />
              </button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={openNewAgent}>
            <Plus className="board-page-btn-icon-sm" />
            New Agent
          </Button>
        </div>
      </div>

      {filtered.length > 0 && (
        <p className="board-page-meta">{filtered.length} agent{filtered.length !== 1 ? "s" : ""}</p>
      )}

      {error && <p className="board-page-error">{error.message}</p>}

      {agents && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          message="Create your first agent to get started."
          action="New Agent"
          onAction={openNewAgent}
        />
      )}

      {effectiveView === "list" && filtered.length > 0 && (
        <div className="agents-list-wrap">
          {filtered.map((agent) => (
            <EntityRow
              key={agent.id}
              title={agent.name}
              subtitle={`${roleLabels[agent.role] ?? agent.role}${agent.title ? ` - ${agent.title}` : ""}`}
              to={agentUrl(agent)}
              leading={
                <span className="agents-status-dot" data-status={agent.status}>
                  <span />
                </span>
              }
              trailing={
                <div className="agents-list-meta">
                  <span className="agents-org-node-mobile">
                    {liveRunByAgent.has(agent.id) ? (
                      <LiveRunIndicator
                        agentRef={agentRouteRef(agent)}
                        runId={liveRunByAgent.get(agent.id)!.runId}
                        liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                      />
                    ) : (
                      <StatusBadge
                        status={agent.status}
                        autoPauseReason={
                          (agent as AgentWithPauseReason).autoPaused
                            ? (agent as AgentWithPauseReason).autoPauseReason
                            : undefined
                        }
                      />
                    )}
                  </span>
                  <div className="agents-org-node-desktop agents-list-meta">
                    {liveRunByAgent.has(agent.id) && (
                      <LiveRunIndicator
                        agentRef={agentRouteRef(agent)}
                        runId={liveRunByAgent.get(agent.id)!.runId}
                        liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                      />
                    )}
                    <span className="agents-list-adapter">
                      {adapterLabels[agent.adapterType] ?? agent.adapterType}
                    </span>
                    <span className="agents-list-time">
                      {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "—"}
                    </span>
                    <span className="agents-list-status-wrap">
                      <StatusBadge
                        status={agent.status}
                        autoPauseReason={
                          (agent as AgentWithPauseReason).autoPaused
                            ? (agent as AgentWithPauseReason).autoPauseReason
                            : undefined
                        }
                      />
                    </span>
                  </div>
                </div>
              }
            />
          ))}
        </div>
      )}

      {effectiveView === "list" && agents && agents.length > 0 && filtered.length === 0 && (
        <p className="board-page-empty-message">No agents match the selected filter.</p>
      )}

      {effectiveView === "org" && filteredOrg.length > 0 && (
        <div className="agents-org-wrap">
          {filteredOrg.map((node) => (
            <OrgTreeNode key={node.id} node={node} depth={0} agentMap={agentMap} liveRunByAgent={liveRunByAgent} />
          ))}
        </div>
      )}

      {effectiveView === "org" && orgTree && orgTree.length > 0 && filteredOrg.length === 0 && (
        <p className="board-page-empty-message">No agents match the selected filter.</p>
      )}

      {effectiveView === "org" && orgTree && orgTree.length === 0 && (
        <p className="board-page-empty-message">No organizational hierarchy defined.</p>
      )}
    </div>
  );
}

function OrgTreeNode({
  node,
  depth,
  agentMap,
  liveRunByAgent,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
}) {
  const agent = agentMap.get(node.id);

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <Link
        to={agent ? agentUrl(agent) : `/agents/${node.id}`}
        className="agents-org-node"
      >
        <span className="agents-org-node-dot" data-status={node.status}>
          <span />
        </span>
        <div className="agents-org-node-body">
          <span className="agents-org-node-name">{node.name}</span>
          <span className="agents-org-node-meta">
            {roleLabels[node.role] ?? node.role}
            {agent?.title ? ` - ${agent.title}` : ""}
          </span>
        </div>
        <div className="agents-org-node-trailing">
          <span className="agents-org-node-mobile">
            {liveRunByAgent.has(node.id) ? (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            ) : (
              <StatusBadge
                status={node.status}
                autoPauseReason={
                  agent && (agent as AgentWithPauseReason).autoPaused
                    ? (agent as AgentWithPauseReason).autoPauseReason
                    : undefined
                }
              />
            )}
          </span>
          <div className="agents-org-node-desktop agents-org-node-trailing">
            {liveRunByAgent.has(node.id) && (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
              />
            )}
            {agent && (
              <>
                <span className="agents-org-node-adapter">
                  {adapterLabels[agent.adapterType] ?? agent.adapterType}
                </span>
                <span className="agents-org-node-time">
                  {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "—"}
                </span>
              </>
            )}
            <span className="agents-list-status-wrap">
              <StatusBadge
                status={node.status}
                autoPauseReason={
                  agent && (agent as AgentWithPauseReason).autoPaused
                    ? (agent as AgentWithPauseReason).autoPauseReason
                    : undefined
                }
              />
            </span>
          </div>
        </div>
      </Link>
      {node.reports && node.reports.length > 0 && (
        <div className="agents-org-children">
          {node.reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} agentMap={agentMap} liveRunByAgent={liveRunByAgent} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveRunIndicator({
  agentRef,
  runId,
  liveCount,
}: {
  agentRef: string;
  runId: string;
  liveCount: number;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      className="agents-live-run-link"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="agents-live-run-dot">
        <span className="agents-live-run-dot-ping" />
      </span>
      <span className="agents-live-run-label">
        Live{liveCount > 1 ? ` (${liveCount})` : ""}
      </span>
    </Link>
  );
}
