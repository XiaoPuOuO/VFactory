import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { agentRouteRef, agentUrl } from "../lib/utils";
import { getAgentModelId, getModelOptionsFromAgents } from "../lib/agent-utils";
import { AgentIcon } from "./AgentIconPicker";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Link } from "@/lib/router";
import type { Agent } from "@paperclipai/shared";
import {
  readStoredTriState,
  SIDEBAR_AGENTS_OPEN_KEY,
  writeStoredTriState,
} from "../lib/navConfig";
import { Filter } from "lucide-react";

/** 樹節點：由內到外（上層在上，下層在下、縮排）。 */
export interface AgentTreeNode {
  agent: Agent;
  children: AgentTreeNode[];
}

/** 依 reportsTo 建樹，根節點（無 reportsTo 或 parent 不在列表中）在前。 */
function buildAgentTree(agents: Agent[]): AgentTreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, Agent[]>();
  for (const a of agents) {
    const parent = a.reportsTo && byId.has(a.reportsTo) ? a.reportsTo : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(a);
    childrenOf.set(parent, list);
  }
  function toNode(agent: Agent): AgentTreeNode {
    const children = (childrenOf.get(agent.id) ?? []).map(toNode);
    return { agent, children };
  }
  const roots = childrenOf.get(null) ?? [];
  return roots.map(toNode);
}

/** 單一節點：可折疊/展開 SubAgents，由內到外縮排。 */
function SidebarAgentNode({
  node,
  depth,
  liveCountByAgent,
  activeAgentId,
  collapsedIds,
  onToggle,
  isMobile,
  setSidebarOpen,
}: {
  node: AgentTreeNode;
  depth: number;
  liveCountByAgent: Map<string, number>;
  activeAgentId: string | null;
  collapsedIds: Set<string>;
  onToggle: (agentId: string) => void;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { agent, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = !collapsedIds.has(agent.id);
  const runCount = liveCountByAgent.get(agent.id) ?? 0;
  const isActive = activeAgentId === agentRouteRef(agent);

  return (
    <div className="board-sidebar-agent-node">
      <div
        className="board-sidebar-agent-row"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={["board-sidebar-agent-toggle", isExpanded && "open"].filter(Boolean).join(" ")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(agent.id);
            }}
            aria-label={isExpanded ? t("nav.collapseSubAgents") : t("nav.expandSubAgents")}
          >
            <ChevronRight />
          </button>
        ) : (
          <span className="board-sidebar-agent-spacer" aria-hidden />
        )}
        <NavLink
          to={agentUrl(agent)}
          onClick={() => {
            if (isMobile) setSidebarOpen(false);
          }}
          className={["board-sidebar-agent-link", isActive && "active"].filter(Boolean).join(" ")}
        >
          <AgentIcon icon={agent.icon} className="board-sidebar-agent-link-icon" />
          <span className="board-sidebar-agent-link-name">{agent.name}</span>
          {runCount > 0 && (
            <span className="board-sidebar-agent-live">
              <span className="board-sidebar-agent-live-dot" />
              <span className="board-sidebar-agent-live-count">
                {t("nav.liveCount", { count: runCount })}
              </span>
            </span>
          )}
        </NavLink>
      </div>
      {hasChildren && isExpanded && (
        <div className="board-sidebar-agent-children">
          {children.map((child) => (
            <SidebarAgentNode
              key={child.agent.id}
              node={child}
              depth={depth + 1}
              liveCountByAgent={liveCountByAgent}
              activeAgentId={activeAgentId}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              isMobile={isMobile}
              setSidebarOpen={setSidebarOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SidebarAgents({ pinnedFullNav = false }: { pinnedFullNav?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() =>
    readStoredTriState(SIDEBAR_AGENTS_OPEN_KEY, pinnedFullNav),
  );
  const prevPinned = useRef(pinnedFullNav);

  useEffect(() => {
    if (pinnedFullNav && !prevPinned.current) {
      setOpen(true);
      writeStoredTriState(SIDEBAR_AGENTS_OPEN_KEY, true);
    }
    prevPinned.current = pinnedFullNav;
  }, [pinnedFullNav]);

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v);
    writeStoredTriState(SIDEBAR_AGENTS_OPEN_KEY, v);
  }, []);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  /** URL 上的 ?model= 與 Agents 頁面篩選同步，側邊欄只顯示該模型的 Agent。 */
  const modelFilter = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return q.has("model") ? (q.get("model") ?? "") : null;
  }, [location.search]);

  const agentTree = useMemo(() => {
    let list = (agents ?? []).filter((a: Agent) => a.status !== "terminated");
    if (modelFilter !== null) {
      list = list.filter((a) => getAgentModelId(a) === modelFilter);
    }
    return buildAgentTree(list);
  }, [agents, modelFilter]);

  const toggleCollapsed = useCallback((agentId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)/);
  const activeAgentId = agentMatch?.[1] ?? null;

  const modelOptions = useMemo(
    () => getModelOptionsFromAgents(agents ?? []),
    [agents]
  );

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <div className={["board-sidebar-collapsible-group", open && "open"].filter(Boolean).join(" ")}>
        <div className="board-sidebar-collapsible-row">
          <CollapsibleTrigger className="board-sidebar-collapsible-trigger">
            <ChevronRight className="board-sidebar-collapsible-chevron" />
            <span className="board-sidebar-collapsible-label">{t("nav.agents")}</span>
          </CollapsibleTrigger>
          <Popover>
            <PopoverTrigger
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={["board-sidebar-popover-trigger", modelFilter !== null && "active"].filter(Boolean).join(" ")}
                aria-label="Filter by model"
              >
                <Filter />
              </button>
            </PopoverTrigger>
            <PopoverContent className="board-sidebar-popover-content" align="start" side="right">
              <div className="board-sidebar-popover-title">Model</div>
              <Link
                to="/agents/all"
                className={["board-sidebar-popover-item", modelFilter === null && "active"].filter(Boolean).join(" ")}
              >
                All models
              </Link>
              {modelOptions.map((opt) => {
                const to = `/agents/all${opt.id === "" ? "?model=" : `?model=${encodeURIComponent(opt.id)}`}`;
                return (
                  <Link
                    key={opt.id === "" ? "__default__" : opt.id}
                    to={to}
                    className={["board-sidebar-popover-item", modelFilter === opt.id && "active"].filter(Boolean).join(" ")}
                    style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openNewAgent();
            }}
            className="board-sidebar-collapsible-add-btn"
            aria-label="New agent"
          >
            <Plus />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="board-sidebar-section-children">
          {agentTree.map((node) => (
            <SidebarAgentNode
              key={node.agent.id}
              node={node}
              depth={0}
              liveCountByAgent={liveCountByAgent}
              activeAgentId={activeAgentId}
              collapsedIds={collapsedIds}
              onToggle={toggleCollapsed}
              isMobile={isMobile}
              setSidebarOpen={setSidebarOpen}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
