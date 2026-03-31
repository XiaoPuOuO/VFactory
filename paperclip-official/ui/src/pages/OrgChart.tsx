import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Download, ListTree, Minus, Network, Plus, RotateCcw } from "lucide-react";
import { OrgChartTreeView } from "../components/OrgChartTreeView";
import { useToast } from "../context/ToastContext";
import {
  buildOrgMarkdownExport,
  downloadTextFile,
  escapeMarkdownInline,
  orgMarkdownFilename,
} from "../lib/orgExportMarkdown";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import "./OrgChart.css";

// Layout constants
const CARD_W = 200;
const CARD_H = 100;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

// ── Tree layout types ───────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  x: number;
  y: number;
  children: LayoutNode[];
}

// ── Layout algorithm ────────────────────────────────────────────────────

/** Compute the width each subtree needs. */
function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

/** Recursively assign x,y positions. */
function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.reports.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    children: layoutChildren,
  };
}

/** Layout all root nodes side by side. */
function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  const totalW = roots.reduce((sum, r) => sum + subtreeWidth(r), 0);
  const gaps = (roots.length - 1) * GAP_X;
  let x = PADDING;
  const y = PADDING;

  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, y));
    x += w + GAP_X;
  }

  // Compute bounds and return
  return result;
}

/** Flatten layout tree to list of nodes. */
function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

/** Collect all parent→child edges. */
function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status dot colors (raw hex for SVG) ─────────────────────────────────

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

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

const VIEW_STORAGE_KEY = "paperclip-org-chart-view";

type OrgChartViewMode = "graph" | "tree";

function readStoredViewMode(): OrgChartViewMode {
  if (typeof window === "undefined") return "graph";
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v === "tree" ? "tree" : "graph";
  } catch {
    return "graph";
  }
}

const TREE_SCALE_KEY = "paperclip-org-tree-scale";
const MIN_TREE_SCALE = 0.7;
const MAX_TREE_SCALE = 1.6;
const TREE_SCALE_STEP = 0.1;

function readStoredTreeScale(): number {
  if (typeof window === "undefined") return 1;
  try {
    const v = parseFloat(window.localStorage.getItem(TREE_SCALE_KEY) ?? "1");
    if (!Number.isFinite(v)) return 1;
    return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, Math.round(v * 10) / 10));
  } catch {
    return 1;
  }
}

function clampTreeScale(n: number): number {
  return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, Math.round(n * 10) / 10));
}

// ── Main component ──────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { pushToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents ?? []) m.set(a.id, a);
    return m;
  }, [agents]);

  const { t, i18n } = useTranslation("org");
  const [viewMode, setViewMode] = useState<OrgChartViewMode>(readStoredViewMode);
  const [treeScale, setTreeScale] = useState(readStoredTreeScale);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore quota */
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TREE_SCALE_KEY, String(treeScale));
    } catch {
      /* ignore quota */
    }
  }, [treeScale]);

  const handleExportMarkdown = useCallback(() => {
    if (!orgTree?.length) {
      pushToast({ title: t("exportMarkdownNoData"), tone: "warn" });
      return;
    }
    try {
      const companyName = selectedCompany?.name?.trim() || t("untitledCompany");
      const dateStr = new Intl.DateTimeFormat(i18n.language?.startsWith("zh") ? "zh-TW" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());
      const intro = t("exportIntro", { date: dateStr });
      const note = t("exportMarkdownBodyNote");
      const introLine = `> ${escapeMarkdownInline(intro)}\n> ${escapeMarkdownInline(note)}`;
      const md = buildOrgMarkdownExport({
        companyName,
        introLine,
        hierarchyHeading: `## ${t("exportSectionHierarchy")}`,
        emptyHierarchyNote: t("exportEmptyHierarchy"),
        roots: orgTree,
        agentMap,
        labels: {
          fieldTitle: t("exportFieldTitle"),
          fieldCapabilities: t("exportFieldCapabilities"),
          emptyCapabilities: t("exportEmptyCapabilities"),
        },
      });
      downloadTextFile(orgMarkdownFilename(companyName), md);
      pushToast({ title: t("exportMarkdownSuccess"), tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({
        title: t("exportMarkdownError"),
        body: message,
        tone: "error",
      });
    }
  }, [agentMap, i18n.language, orgTree, pushToast, selectedCompany?.name, t]);

  useEffect(() => {
    setBreadcrumbs([{ label: t("pageTitle") }]);
  }, [setBreadcrumbs, t]);

  // Layout computation
  const layout = useMemo(() => layoutForest(orgTree ?? []), [orgTree]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom state
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  /** 圖表模式初次載入或從樹狀切回時自動 fit；其餘時機保留使用者平移／縮放 */
  const chartFitDone = useRef(false);
  const prevViewMode = useRef<OrgChartViewMode>(viewMode);
  useEffect(() => {
    if (prevViewMode.current === "tree" && viewMode === "graph") {
      chartFitDone.current = false;
    }
    prevViewMode.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    if (viewMode !== "graph") return;
    if (chartFitDone.current || allNodes.length === 0 || !containerRef.current) return;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    chartFitDone.current = true;
    setZoom(fitZoom);
    setPan({
      x: (containerW - chartW) / 2,
      y: (containerH - chartH) / 2,
    });
  }, [allNodes, bounds, viewMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Don't drag if clicking a card
    const target = e.target as HTMLElement;
    if (target.closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);

    // Zoom toward mouse position
    const scale = newZoom / zoom;
    setPan({
      x: mouseX - scale * (mouseX - pan.x),
      y: mouseY - scale * (mouseY - pan.y),
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message={t("selectCompanyToView")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (orgTree && orgTree.length === 0) {
    return <EmptyState icon={Network} message={t("noHierarchy")} />;
  }

  return (
    <div className="org-chart-page">
      <div
        className="org-chart-toolbar"
        role="toolbar"
        aria-label={t("viewModeToolbarAria")}
      >
        <div className="org-chart-toolbar-start">
          <div
            className="org-chart-view-segment"
            role="tablist"
            aria-label={t("viewModeAria")}
          >
            <button
              type="button"
              role="tab"
              className={`org-chart-view-tab ${viewMode === "graph" ? "active" : ""}`}
              aria-selected={viewMode === "graph"}
              onClick={() => setViewMode("graph")}
              title={t("viewGraph")}
            >
              <Network aria-hidden className="org-chart-view-tab-icon" />
              <span className="org-chart-view-tab-label">{t("viewGraph")}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={`org-chart-view-tab ${viewMode === "tree" ? "active" : ""}`}
              aria-selected={viewMode === "tree"}
              onClick={() => setViewMode("tree")}
              title={t("viewTree")}
            >
              <ListTree aria-hidden className="org-chart-view-tab-icon" />
              <span className="org-chart-view-tab-label">{t("viewTree")}</span>
            </button>
          </div>
        </div>

        <div className="org-chart-toolbar-end">
          {viewMode === "tree" && (
            <div
              className="org-chart-tree-size"
              role="group"
              aria-label={t("treeSizeAria")}
            >
              <button
                type="button"
                className="org-chart-tree-size-btn"
                onClick={() => setTreeScale((s) => clampTreeScale(s - TREE_SCALE_STEP))}
                disabled={treeScale <= MIN_TREE_SCALE}
                aria-label={t("treeSizeSmaller")}
                title={t("treeSizeSmaller")}
              >
                <Minus aria-hidden className="org-chart-tree-size-icon" />
              </button>
              <span className="org-chart-tree-size-value" aria-live="polite">
                {Math.round(treeScale * 100)}%
              </span>
              <button
                type="button"
                className="org-chart-tree-size-btn"
                onClick={() => setTreeScale((s) => clampTreeScale(s + TREE_SCALE_STEP))}
                disabled={treeScale >= MAX_TREE_SCALE}
                aria-label={t("treeSizeLarger")}
                title={t("treeSizeLarger")}
              >
                <Plus aria-hidden className="org-chart-tree-size-icon" />
              </button>
              <button
                type="button"
                className="org-chart-tree-size-btn org-chart-tree-size-reset"
                onClick={() => setTreeScale(1)}
                aria-label={t("treeSizeReset")}
                title={t("treeSizeReset")}
              >
                <RotateCcw aria-hidden className="org-chart-tree-size-icon" />
              </button>
            </div>
          )}
          <button
            type="button"
            className="org-chart-export-btn"
            onClick={handleExportMarkdown}
            title={t("exportMarkdownHint")}
          >
            <Download aria-hidden className="org-chart-export-icon" />
            <span>{t("exportMarkdown")}</span>
          </button>
        </div>
      </div>

      {viewMode === "tree" ? (
        <div className="org-chart-tree-panel">
          <div
            className="org-chart-tree-panel-inner"
            style={{ zoom: treeScale }}
          >
            <OrgChartTreeView nodes={orgTree ?? []} agentMap={agentMap} />
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="org-chart-container"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div className="org-chart-zoom-buttons">
            <button
              type="button"
              className="org-chart-zoom-btn"
              onClick={() => {
                const newZoom = Math.min(zoom * 1.2, 2);
                const container = containerRef.current;
                if (container) {
                  const cx = container.clientWidth / 2;
                  const cy = container.clientHeight / 2;
                  const scale = newZoom / zoom;
                  setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
                }
                setZoom(newZoom);
              }}
              aria-label={t("zoomIn")}
            >
              +
            </button>
            <button
              type="button"
              className="org-chart-zoom-btn"
              onClick={() => {
                const newZoom = Math.max(zoom * 0.8, 0.2);
                const container = containerRef.current;
                if (container) {
                  const cx = container.clientWidth / 2;
                  const cy = container.clientHeight / 2;
                  const scale = newZoom / zoom;
                  setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
                }
                setZoom(newZoom);
              }}
              aria-label={t("zoomOut")}
            >
              &minus;
            </button>
            <button
              type="button"
              className="org-chart-zoom-btn fit"
              onClick={() => {
                if (!containerRef.current) return;
                const cW = containerRef.current.clientWidth;
                const cH = containerRef.current.clientHeight;
                const scaleX = (cW - 40) / bounds.width;
                const scaleY = (cH - 40) / bounds.height;
                const fitZoom = Math.min(scaleX, scaleY, 1);
                const chartW = bounds.width * fitZoom;
                const chartH = bounds.height * fitZoom;
                setZoom(fitZoom);
                setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
              }}
              title={t("fitToScreen")}
              aria-label={t("fitToScreen")}
            >
              Fit
            </button>
          </div>

          <svg
        className="org-chart-svg"
        style={{ width: "100%", height: "100%" }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {edges.map(({ parent, child }) => {
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + CARD_H;
            const x2 = child.x + CARD_W / 2;
            const y2 = child.y;
            const midY = (y1 + y2) / 2;

            return (
              <path
                key={`${parent.id}-${child.id}`}
                d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      </svg>

      <div
        className="org-chart-cards-wrap"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {allNodes.map((node) => {
          const agent = agentMap.get(node.id);
          const dotColor = statusDotColor[node.status] ?? defaultDotColor;

          return (
            <div
              key={node.id}
              data-org-card
              className="org-chart-card"
              style={{
                left: node.x,
                top: node.y,
                width: CARD_W,
                minHeight: CARD_H,
              }}
              onClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
            >
              <div className="org-chart-card-inner">
                <div className="org-chart-card-avatar">
                  <div className="org-chart-card-avatar-box">
                    <AgentIcon icon={agent?.icon} />
                  </div>
                  <span
                    className="org-chart-card-dot"
                    style={{ backgroundColor: dotColor }}
                  />
                </div>
                <div className="org-chart-card-body">
                  <span className="org-chart-card-name">{node.name}</span>
                  <span className="org-chart-card-role">
                    {agent?.title ?? roleLabel(node.role)}
                  </span>
                  {agent && (
                    <span className="org-chart-card-adapter">
                      {adapterLabels[agent.adapterType] ?? agent.adapterType}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
        </div>
      )}
    </div>
  );
}

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}
