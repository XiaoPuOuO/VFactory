/**
 * 以 @xyflow/react 呈現 skill `flow`，並與 SKILL.md YAML 雙向同步（結構與側欄欄位；節點座標不寫回檔案）。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { SkillFlowStep } from "@paperclipai/shared";
import { safeParseSkillFrontmatterFromMarkdownForFlowEditor } from "@paperclipai/shared";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/context/ThemeContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFlowFromFrontmatter, mergeFlowIntoSkillMarkdown } from "../lib/skillMarkdownFlow";
import { TemplateVariableInserter, useTextareaVariableInsert, type PriorOutputVar } from "./TemplateVariableInserter";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, HelpCircle } from "lucide-react";
import { WORKFLOW_FLOW_EDITOR_STEP_KINDS } from "../lib/workflowFlowStepKinds";
import "./WorkflowFlowEditor.css";

/** 欄位標題 + (?) 說明，對齊流程編輯器用語 */
function FlowFieldLabelWithHelp({
  label,
  tooltip,
  htmlFor,
}: {
  label: string;
  tooltip: string;
  htmlFor?: string;
}) {
  return (
    <div className="workflow-flow-editor-label-row">
      {htmlFor ? (
        <Label
          htmlFor={htmlFor}
          className="workflow-flow-editor-field-label workflow-flow-editor-field-label--inline"
        >
          {label}
        </Label>
      ) : (
        <span className="workflow-flow-editor-field-label workflow-flow-editor-field-label--inline">{label}</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="ui-agent-hint-btn" aria-label={tooltip}>
            <HelpCircle aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="ui-agent-tooltip-content">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const GAP_X = 260;
const GAP_Y = 100;

function stepId(s: SkillFlowStep): string {
  if (s.kind === "prompt") {
    const id = s.id?.trim();
    return id && id.length > 0 ? id : "default-prompt";
  }
  return s.id;
}

function stepLabel(s: SkillFlowStep): string {
  if (s.name?.trim()) return s.name.trim();
  if (s.kind === "prompt") {
    const t = s.template.trim().slice(0, 48);
    return t.length > 0 ? t : stepId(s);
  }
  if (s.kind === "checkpoint") return s.message.trim().slice(0, 48) || s.id;
  if (s.kind === "condition") return s.condition.trim().slice(0, 48) || s.id;
  if (s.kind === "action") return `${s.action}`;
  if (s.kind === "invoke_workflow") return s.skill_key;
  return `${s.list_from} → ${s.item_as}`;
}

type StepNodeData = { kind: SkillFlowStep["kind"]; label: string };

function StepNode({ id, data, selected }: NodeProps<Node<StepNodeData>>) {
  const kind = data.kind;
  return (
    <div
      className={`workflow-flow-node workflow-flow-node-${kind} ${selected ? "workflow-flow-node-selected" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      {/* 供 depends_on 順序鏈使用；與核准/分支把手分離 */}
      <Handle type="source" position={Position.Right} id="default" />
      {kind === "checkpoint" && (
        <>
          <Handle type="source" position={Position.Bottom} id="approve" style={{ left: "28%" }} />
          <Handle type="source" position={Position.Bottom} id="reject" style={{ left: "72%" }} />
        </>
      )}
      {kind === "condition" && (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: "28%" }} />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: "72%" }} />
        </>
      )}
      {kind === "loop" && <Handle type="source" position={Position.Bottom} id="body" />}
      <span className="workflow-flow-node-kind">{kind}</span>
      <div className="workflow-flow-node-label">{data.label}</div>
      <span className="sr-only" id={`${id}-aria`}>
        {kind} {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { step: StepNode };

function buildGraphEdges(steps: SkillFlowStep[]): Edge[] {
  const ids = new Set(steps.map(stepId));
  const out: Edge[] = [];
  const seen = new Set<string>();

  const push = (e: Omit<Edge, "id"> & { id: string }) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    out.push({
      ...e,
      label: e.label,
    });
  };

  for (const s of steps) {
    const tid = stepId(s);
    for (const dep of s.depends_on ?? []) {
      if (!ids.has(dep)) continue;
      push({
        id: `dep-${dep}-${tid}`,
        source: dep,
        target: tid,
        sourceHandle: "default",
      });
    }
    if (s.kind === "checkpoint") {
      if (ids.has(s.on_approve)) {
        push({
          id: `cp-${tid}-a-${s.on_approve}`,
          source: tid,
          target: s.on_approve,
          sourceHandle: "approve",
          label: "OK",
        });
      }
      if (ids.has(s.on_reject)) {
        push({
          id: `cp-${tid}-r-${s.on_reject}`,
          source: tid,
          target: s.on_reject,
          sourceHandle: "reject",
          label: "×",
        });
      }
    }
    if (s.kind === "condition") {
      if (ids.has(s.if_true)) {
        push({
          id: `cd-${tid}-t-${s.if_true}`,
          source: tid,
          target: s.if_true,
          sourceHandle: "true",
          label: "T",
        });
      }
      if (ids.has(s.if_false)) {
        push({
          id: `cd-${tid}-f-${s.if_false}`,
          source: tid,
          target: s.if_false,
          sourceHandle: "false",
          label: "F",
        });
      }
    }
    if (s.kind === "loop") {
      for (const bid of s.body) {
        if (!ids.has(bid)) continue;
        push({
          id: `loop-${tid}-b-${bid}`,
          source: tid,
          target: bid,
          sourceHandle: "body",
          label: "∑",
        });
      }
    }
  }
  return out;
}

function layoutNodes(steps: SkillFlowStep[], edges: Edge[]): Record<string, { x: number; y: number }> {
  const ids = steps.map(stepId);
  const pred = new Map<string, Set<string>>();
  for (const id of ids) pred.set(id, new Set());
  for (const e of edges) {
    if (pred.has(e.target)) pred.get(e.target)!.add(e.source);
  }

  const level = new Map<string, number>();
  const visiting = new Set<string>();

  const dfs = (u: string): number => {
    if (level.has(u)) return level.get(u)!;
    if (visiting.has(u)) {
      level.set(u, 0);
      return 0;
    }
    visiting.add(u);
    const ps = [...(pred.get(u) ?? [])];
    let L = 0;
    if (ps.length > 0) {
      L = Math.max(...ps.map((p) => dfs(p))) + 1;
    }
    level.set(u, L);
    visiting.delete(u);
    return L;
  };
  for (const id of ids) dfs(id);

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const L = level.get(id) ?? 0;
    if (!byLevel.has(L)) byLevel.set(L, []);
    byLevel.get(L)!.push(id);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);
  for (const L of sortedLevels) {
    const row = byLevel.get(L)!;
    row.forEach((id, i) => {
      pos[id] = {
        x: L * GAP_X,
        y: i * GAP_Y - ((row.length - 1) * GAP_Y) / 2,
      };
    });
  }
  return pos;
}

function stepsToNodes(
  steps: SkillFlowStep[],
  positions: Record<string, { x: number; y: number }>,
): Node<StepNodeData>[] {
  return steps.map((s) => {
    const id = stepId(s);
    const p = positions[id] ?? { x: 0, y: 0 };
    return {
      id,
      type: "step",
      position: p,
      data: { kind: s.kind, label: stepLabel(s) },
    };
  });
}

function updateStepByNodeId(steps: SkillFlowStep[], nodeId: string, patch: Partial<SkillFlowStep>): SkillFlowStep[] {
  return steps.map((s) => {
    if (stepId(s) !== nodeId) return s;
    return { ...s, ...patch } as SkillFlowStep;
  });
}

function removeDependencyEdge(steps: SkillFlowStep[], source: string, target: string): SkillFlowStep[] {
  return steps.map((s) => {
    if (stepId(s) !== target) return s;
    const deps = s.depends_on ?? [];
    const next = deps.filter((d) => d !== source);
    if (next.length === deps.length) return s;
    return { ...s, depends_on: next.length > 0 ? next : undefined } as SkillFlowStep;
  });
}

function applyConnection(steps: SkillFlowStep[], conn: Connection): SkillFlowStep[] {
  if (!conn.source || !conn.target) return steps;
  const targetId = conn.target;
  const sourceId = conn.source;
  if (sourceId === targetId) return steps;

  return steps.map((s) => {
    if (stepId(s) !== targetId) return s;
    const deps = [...(s.depends_on ?? [])];
    if (!deps.includes(sourceId)) deps.push(sourceId);
    return { ...s, depends_on: deps } as SkillFlowStep;
  });
}

export type WorkflowFlowEditorProps = {
  markdown: string;
  onMarkdownChange: (next: string) => void;
  /**
   * 與 frontmatter `arguments[].name` 對應，供「插入變數」列出 {{name}}（與步驟 output 分開）。
   */
  argumentNames?: string[];
};

/** 右鍵「新增步驟」：錨點節點（depends_on）與／或游標對應之 flow 座標。 */
type WorkflowFlowAddStepPlacement = {
  anchorNodeId?: string | null;
  flowPosition?: { x: number; y: number } | null;
};

/** 右鍵選單鍵盤焦點：main-0＝「新增步驟」（點擊＝預設 prompt）；sub＝步驟類型子選單（索引對應 {@link WORKFLOW_FLOW_EDITOR_STEP_KINDS}）。 */
type FlowContextMenuNavFocus =
  | { zone: "main"; index: 0 | 1 }
  | { zone: "sub"; index: number };

function collectPriorOutputsForPrompt(steps: SkillFlowStep[], selectedNodeId: string | null): PriorOutputVar[] {
  if (!selectedNodeId) return [];
  const idx = steps.findIndex((s) => stepId(s) === selectedNodeId);
  if (idx <= 0) return [];
  const out: PriorOutputVar[] = [];
  for (let i = 0; i < idx; i++) {
    const s = steps[i]!;
    if (s.kind === "prompt" || s.kind === "invoke_workflow") {
      const ok = s.output?.trim();
      if (ok) {
        out.push({
          outputKey: ok,
          stepLabel: s.name?.trim() || ("id" in s ? s.id : "") || `Step ${i + 1}`,
        });
      }
    }
  }
  return out;
}

function FlowPromptTemplateFields({
  template,
  onTemplateChange,
  priorOutputs,
  argumentNames,
}: {
  template: string;
  onTemplateChange: (v: string) => void;
  priorOutputs: PriorOutputVar[];
  argumentNames: string[];
}) {
  const { t } = useTranslation(["companySkills"]);
  const { textareaRef, captureSelection, insertToken } = useTextareaVariableInsert(template, onTemplateChange);
  return (
    <>
      <div className="workflow-flow-template-label-row">
        <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldTemplate")}</Label>
        <TemplateVariableInserter insertToken={insertToken} argumentNames={argumentNames} priorOutputs={priorOutputs} />
      </div>
      <Textarea
        ref={textareaRef}
        onSelect={captureSelection}
        rows={5}
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        spellCheck={false}
      />
    </>
  );
}

function WorkflowFlowEditorInner({ markdown, onMarkdownChange, argumentNames = [] }: WorkflowFlowEditorProps) {
  const { t } = useTranslation(["companySkills"]);
  const { theme } = useTheme();
  const [parseError, setParseError] = useState<string | null>(null);
  const [steps, setSteps] = useState<SkillFlowStep[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastExternalMarkdown = useRef(markdown);
  const markdownRef = useRef(markdown);
  const structuralKey = useRef("");
  const reactFlowInstanceRef = useRef<ReactFlowInstance<Node<StepNodeData>, Edge> | null>(null);
  const flowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [flowContextMenu, setFlowContextMenu] = useState<{
    clientX: number;
    clientY: number;
    flowX: number;
    flowY: number;
    targetNodeId?: string;
  } | null>(null);
  const [flowContextMenuFixed, setFlowContextMenuFixed] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [menuNavFocus, setMenuNavFocus] = useState<FlowContextMenuNavFocus>({ zone: "main", index: 0 });

  useEffect(() => {
    markdownRef.current = markdown;
  }, [markdown]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StepNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /** 與側欄編輯一致：以 selectedId 驅動節點選取（含右鍵選取）；steps 變更後重算選取狀態 */
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: selectedId !== null && n.id === selectedId,
      })),
    );
  }, [selectedId, setNodes, steps]);

  function formatParseError(err: unknown): string {
    if (err && typeof err === "object" && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
      const issues = (err as { issues: { message?: string }[] }).issues;
      return issues.map((i) => i.message ?? "").filter(Boolean).join("；") || t("companySkills:workflowFlowParseError");
    }
    if (err instanceof Error) return err.message;
    return t("companySkills:workflowFlowParseError");
  }

  const syncFromMarkdown = useCallback(
    (md: string) => {
      const parsed = safeParseSkillFrontmatterFromMarkdownForFlowEditor(md);
      if (!parsed.success) {
        setParseError(formatParseError(parsed.error));
        setSteps([]);
        setNodes([]);
        setEdges([]);
        return;
      }
      setParseError(null);
      const flow = getFlowFromFrontmatter(parsed.data);
      setSteps(flow);
      const rfEdges = buildGraphEdges(flow);
      const key = flow.map(stepId).join("\0");
      if (structuralKey.current !== key) {
        structuralKey.current = key;
        const pos = layoutNodes(flow, rfEdges);
        setNodes(stepsToNodes(flow, pos));
        setEdges(rfEdges);
      } else {
        setEdges(rfEdges);
        setNodes((prev) => {
          const posById = new Map(prev.map((n) => [n.id, n.position]));
          const built = stepsToNodes(flow, Object.fromEntries(posById));
          return built.map((n) => ({
            ...n,
            position: posById.get(n.id) ?? n.position,
          }));
        });
      }
    },
    [setEdges, setNodes, t],
  );

  useEffect(() => {
    lastExternalMarkdown.current = markdown;
    syncFromMarkdown(markdown);
  }, [markdown, syncFromMarkdown]);

  const emitSteps = useCallback(
    (nextSteps: SkillFlowStep[]) => {
      setSteps(nextSteps);
      try {
        const nextMd = mergeFlowIntoSkillMarkdown(markdownRef.current, nextSteps);
        lastExternalMarkdown.current = nextMd;
        onMarkdownChange(nextMd);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
      }
    },
    [onMarkdownChange],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setSteps((prev) => {
        const next = applyConnection(prev, params);
        try {
          const nextMd = mergeFlowIntoSkillMarkdown(markdownRef.current, next);
          lastExternalMarkdown.current = nextMd;
          onMarkdownChange(nextMd);
        } catch {
          /* keep local state; error surfaced on next validate */
        }
        setEdges(buildGraphEdges(next));
        return next;
      });
    },
    [onMarkdownChange, setEdges],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      setSteps((prev) => {
        let next = prev;
        for (const e of deleted) {
          if (e.sourceHandle == null || e.sourceHandle === "default") {
            next = removeDependencyEdge(next, e.source, e.target);
          }
        }
        try {
          const nextMd = mergeFlowIntoSkillMarkdown(markdownRef.current, next);
          lastExternalMarkdown.current = nextMd;
          onMarkdownChange(nextMd);
        } catch {
          /* noop */
        }
        setEdges(buildGraphEdges(next));
        return next;
      });
    },
    [onMarkdownChange, setEdges],
  );

  const selectedStep = useMemo(
    () => (selectedId ? steps.find((s) => stepId(s) === selectedId) ?? null : null),
    [steps, selectedId],
  );

  const patchSelected = (patch: Partial<SkillFlowStep>) => {
    if (!selectedId) return;
    const idx = steps.findIndex((s) => stepId(s) === selectedId);
    if (idx < 0) return;
    const next = updateStepByNodeId(steps, selectedId, patch);
    const newId = stepId(next[idx]!);
    emitSteps(next);
    const rfEdges = buildGraphEdges(next);
    const pos = layoutNodes(next, rfEdges);
    setEdges(rfEdges);
    setNodes(stepsToNodes(next, pos));
    structuralKey.current = next.map(stepId).join("\0");
    if (newId !== selectedId) setSelectedId(newId);
  };

  const changeSelectedKind = (nextKind: SkillFlowStep["kind"]) => {
    if (!selectedId) return;
    const idx = steps.findIndex((s) => stepId(s) === selectedId);
    if (idx < 0) return;
    const current = steps[idx]!;
    if (current.kind === nextKind) return;

    const keep = {
      id: stepId(current),
      name: current.name,
      depends_on: (current as any).depends_on as string[] | undefined,
      require_approval_before: (current as any).require_approval_before as boolean | undefined,
    };

    const otherStepIds = steps.map(stepId).filter((id) => id !== keep.id);
    const fallbackTargetId =
      (idx > 0 ? stepId(steps[idx - 1]!) : null) ??
      otherStepIds[otherStepIds.length - 1] ??
      null;

    const ensureAnchorPrompt = (): { anchorId: string; extraSteps: SkillFlowStep[] } => {
      const existingPrompt = steps.find((s) => s.kind === "prompt" && stepId(s) !== keep.id) as
        | Extract<SkillFlowStep, { kind: "prompt" }>
        | undefined;
      if (existingPrompt?.id) return { anchorId: existingPrompt.id, extraSteps: [] };
      const pid = `step-${crypto.randomUUID().slice(0, 8)}`;
      const p: SkillFlowStep = { kind: "prompt", id: pid, template: " " };
      return { anchorId: pid, extraSteps: [p] };
    };

    let replacement: SkillFlowStep;
    let extraSteps: SkillFlowStep[] = [];

    if (nextKind === "prompt") {
      replacement = {
        kind: "prompt",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        template: current.kind === "prompt" ? current.template : " ",
        ...(current.kind === "prompt" && current.output ? { output: current.output } : {}),
        ...(current.kind === "prompt" && current.require_human_input != null
          ? { require_human_input: current.require_human_input }
          : {}),
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    } else if (nextKind === "checkpoint") {
      const { anchorId, extraSteps: extra } = fallbackTargetId ? { anchorId: fallbackTargetId, extraSteps: [] } : ensureAnchorPrompt();
      extraSteps = extra;
      replacement = {
        kind: "checkpoint",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        message: current.kind === "checkpoint" ? current.message : "請確認",
        on_approve: current.kind === "checkpoint" ? current.on_approve : anchorId,
        on_reject: current.kind === "checkpoint" ? current.on_reject : anchorId,
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    } else if (nextKind === "condition") {
      const { anchorId, extraSteps: extra } = fallbackTargetId ? { anchorId: fallbackTargetId, extraSteps: [] } : ensureAnchorPrompt();
      extraSteps = extra;
      replacement = {
        kind: "condition",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        condition: current.kind === "condition" ? current.condition : "{{tier}} == 'premium'",
        if_true: current.kind === "condition" ? current.if_true : anchorId,
        if_false: current.kind === "condition" ? current.if_false : anchorId,
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    } else if (nextKind === "action") {
      replacement = {
        kind: "action",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        action: "create_issue",
        params: {},
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    } else if (nextKind === "invoke_workflow") {
      replacement = {
        kind: "invoke_workflow",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        skill_key: "target-workflow-skill",
        args: [],
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    } else {
      // loop
      const { anchorId, extraSteps: extra } = ensureAnchorPrompt();
      extraSteps = extra;
      replacement = {
        kind: "loop",
        id: keep.id,
        ...(keep.name ? { name: keep.name } : {}),
        list_from: "items",
        item_as: "item",
        body: [anchorId],
        ...(keep.require_approval_before != null ? { require_approval_before: keep.require_approval_before } : {}),
        ...(keep.depends_on ? { depends_on: keep.depends_on } : {}),
      };
    }

    const nextSteps = [...steps.slice(0, idx), replacement, ...steps.slice(idx + 1), ...extraSteps];
    pushSteps(nextSteps, keep.id);
  };

  const pushSteps = (
    next: SkillFlowStep[],
    selectId: string,
    opts?: { positionOverride?: Record<string, { x: number; y: number }> },
  ) => {
    emitSteps(next);
    const rfEdges = buildGraphEdges(next);
    const pos = layoutNodes(next, rfEdges);
    const merged = opts?.positionOverride ? { ...pos, ...opts.positionOverride } : pos;
    setEdges(rfEdges);
    setNodes(stepsToNodes(next, merged));
    setSelectedId(selectId);
  };

  const addStepOfKind = (kind: SkillFlowStep["kind"], placement?: WorkflowFlowAddStepPlacement | null) => {
    const anchorNodeId = placement?.anchorNodeId ?? null;
    const flowPosition = placement?.flowPosition ?? null;
    const pushWithPlacement = (nextSteps: SkillFlowStep[], selectId: string) => {
      pushSteps(
        nextSteps,
        selectId,
        flowPosition ? { positionOverride: { [selectId]: flowPosition } } : undefined,
      );
    };
    const newId = `step-${crypto.randomUUID().slice(0, 8)}`;
    const anchor = anchorNodeId ?? (steps.length > 0 ? stepId(steps[steps.length - 1]!) : null);
    const fallback = anchor ?? newId;

    let next: SkillFlowStep[];
    if (kind === "prompt") {
      next = [
        ...steps,
        {
          kind: "prompt",
          id: newId,
          template: " ",
          ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
        },
      ];
      pushWithPlacement(next, newId);
      return;
    }
    if (kind === "checkpoint") {
      if (!anchor) {
        const pid = `step-${crypto.randomUUID().slice(0, 8)}`;
        const p: SkillFlowStep = { kind: "prompt", id: pid, template: " " };
        const c: SkillFlowStep = {
          kind: "checkpoint",
          id: newId,
          message: "請確認",
          on_approve: pid,
          on_reject: pid,
        };
        next = [...steps, p, c];
        pushWithPlacement(next, newId);
        return;
      }
      next = [
        ...steps,
        {
          kind: "checkpoint",
          id: newId,
          message: "請確認",
          on_approve: anchor,
          on_reject: anchor,
          ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
        },
      ];
      pushWithPlacement(next, newId);
      return;
    }
    if (kind === "condition") {
      if (!anchor) {
        const pid = `step-${crypto.randomUUID().slice(0, 8)}`;
        const p: SkillFlowStep = { kind: "prompt", id: pid, template: " " };
        const cond: SkillFlowStep = {
          kind: "condition",
          id: newId,
          condition: "{{tier}} == 'premium'",
          if_true: pid,
          if_false: pid,
        };
        next = [...steps, p, cond];
        pushWithPlacement(next, newId);
        return;
      }
      next = [
        ...steps,
        {
          kind: "condition",
          id: newId,
          condition: "{{tier}} == 'premium'",
          if_true: anchor,
          if_false: anchor,
          ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
        },
      ];
      pushWithPlacement(next, newId);
      return;
    }
    if (kind === "action") {
      next = [
        ...steps,
        {
          kind: "action",
          id: newId,
          action: "create_issue",
          params: {},
          ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
        },
      ];
      pushWithPlacement(next, newId);
      return;
    }
    if (kind === "invoke_workflow") {
      next = [
        ...steps,
        {
          kind: "invoke_workflow",
          id: newId,
          skill_key: "target-workflow-skill",
          args: [],
          ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
        },
      ];
      pushWithPlacement(next, newId);
      return;
    }
    const pid = `step-${crypto.randomUUID().slice(0, 8)}`;
    const p: SkillFlowStep = { kind: "prompt", id: pid, template: " " };
    const loop: SkillFlowStep = {
      kind: "loop",
      id: newId,
      list_from: "items",
      item_as: "item",
      body: [pid],
      ...(anchorNodeId ? { depends_on: [anchorNodeId] } : {}),
    };
    next = [...steps, p, loop];
    pushWithPlacement(next, newId);
  };

  const removeStepById = useCallback(
    (idToRemove: string) => {
      const next = steps.filter((s) => stepId(s) !== idToRemove);
      emitSteps(next);
      const rfEdges = buildGraphEdges(next);
      const pos = layoutNodes(next, rfEdges);
      setEdges(rfEdges);
      setNodes(stepsToNodes(next, pos));
      setSelectedId((prev) => (prev === idToRemove ? null : prev));
    },
    [emitSteps, setEdges, setNodes, steps],
  );

  const priorOutputsForTemplate = useMemo(
    () => collectPriorOutputsForPrompt(steps, selectedId),
    [steps, selectedId],
  );

  const closeFlowContextMenu = useCallback(() => setFlowContextMenu(null), []);

  const openFlowContextMenu = useCallback((e: ReactMouseEvent | MouseEvent, targetNodeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetNodeId) {
      setSelectedId(targetNodeId);
    }
    const inst = reactFlowInstanceRef.current;
    if (!inst) return;
    const p = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setMenuNavFocus({ zone: "main", index: 0 });
    setFlowContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      flowX: p.x,
      flowY: p.y,
      ...(targetNodeId ? { targetNodeId } : {}),
    });
  }, []);

  /**
   * 右鍵「新增步驟」父層點擊／Enter（main-0）：直接建立 `kind: "prompt"`（AI 執行），與子選單並存；
   * 子選單選項為主時改以 handleAddStepKindFromContext 建立對應種類。皆不開 modal。
   */
  function handleAddPromptFromContext() {
    if (!flowContextMenu) return;
    const placement: WorkflowFlowAddStepPlacement = {
      anchorNodeId: flowContextMenu.targetNodeId ?? null,
      flowPosition: { x: flowContextMenu.flowX, y: flowContextMenu.flowY },
    };
    closeFlowContextMenu();
    addStepOfKind("prompt", placement);
  }

  function handleAddStepKindFromContext(kind: SkillFlowStep["kind"]) {
    if (!flowContextMenu) return;
    const placement: WorkflowFlowAddStepPlacement = {
      anchorNodeId: flowContextMenu.targetNodeId ?? null,
      flowPosition: { x: flowContextMenu.flowX, y: flowContextMenu.flowY },
    };
    closeFlowContextMenu();
    addStepOfKind(kind, placement);
  }

  const handleContextMenuDeleteStep = useCallback(() => {
    const id = flowContextMenu?.targetNodeId;
    if (!id) return;
    removeStepById(id);
    closeFlowContextMenu();
  }, [flowContextMenu, removeStepById, closeFlowContextMenu]);

  useLayoutEffect(() => {
    if (!flowContextMenu) return;
    const el = flowContextMenuRef.current;
    const pad = 8;
    const cx = flowContextMenu.clientX;
    const cy = flowContextMenu.clientY;
    if (!el) {
      setFlowContextMenuFixed({ left: cx, top: cy });
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = cx;
    let top = cy;
    if (left + w + pad > window.innerWidth) left = window.innerWidth - w - pad;
    if (top + h + pad > window.innerHeight) top = window.innerHeight - h - pad;
    left = Math.max(pad, left);
    top = Math.max(pad, top);
    setFlowContextMenuFixed({ left, top });
  }, [flowContextMenu]);

  useEffect(() => {
    if (!flowContextMenu) return;
    const onDocMouseDown = (ev: MouseEvent) => {
      const t = ev.target;
      if (t instanceof Element && flowContextMenuRef.current?.contains(t)) return;
      closeFlowContextMenu();
    };
    const onDocKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeFlowContextMenu();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown, true);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [flowContextMenu, closeFlowContextMenu]);

  useEffect(() => {
    if (!flowContextMenu) return;
    queueMicrotask(() => {
      const key =
        menuNavFocus.zone === "main" ? `main-${menuNavFocus.index}` : `sub-${menuNavFocus.index}`;
      flowContextMenuRef.current?.querySelector<HTMLElement>(`[data-menu-focus="${key}"]`)?.focus();
    });
  }, [flowContextMenu, menuNavFocus]);

  if (parseError && steps.length === 0) {
    return <div className="workflow-flow-editor-error">{parseError}</div>;
  }

  return (
    <div className="workflow-flow-editor">
      <div className="workflow-flow-editor-split">
        <div className="workflow-flow-editor-canvas-column">
          <div className="workflow-flow-editor-canvas-wrap">
            <ReactFlow
              colorMode={theme}
              nodes={nodes}
              edges={edges}
              onInit={(inst) => {
                reactFlowInstanceRef.current = inst;
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              onPaneContextMenu={(e) => openFlowContextMenu(e)}
              onNodeContextMenu={(e, node) => openFlowContextMenu(e, node.id)}
              onMoveStart={closeFlowContextMenu}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background />
              <Controls
                className="workflow-flow-controls"
                showInteractive={false}
                aria-label={t("companySkills:workflowFlowControlsAria")}
              />
              <MiniMap
                className="workflow-flow-minimap"
                pannable
                zoomable
                ariaLabel={t("companySkills:workflowFlowMinimapAria")}
                style={{ width: 160, height: 112 }}
              />
            </ReactFlow>
          </div>
          <p className="workflow-flow-editor-chrome-hint">{t("companySkills:workflowFlowChromeHint")}</p>
        </div>

        <div className="workflow-flow-editor-side">
          <div className="workflow-flow-editor-side-title">{t("companySkills:workflowFlowSideTitle")}</div>
          {!selectedStep && (
            <p className="workflow-flow-editor-side-hint">{t("companySkills:workflowFlowSideEmpty")}</p>
          )}
          {selectedStep && (
            <div className="workflow-flow-editor-field">
              <FlowFieldLabelWithHelp
                label={t("companySkills:workflowFlowFieldKind")}
                tooltip={t("companySkills:workflowFlowFieldKindTooltip")}
              />
              <Select value={selectedStep.kind} onValueChange={(v) => changeSelectedKind(v as SkillFlowStep["kind"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_FLOW_EDITOR_STEP_KINDS.map((entry) => (
                    <SelectItem key={entry.kind} value={entry.kind}>
                      {t(`companySkills:${entry.titleKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {selectedStep?.kind === "prompt" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id ?? ""}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() || undefined })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldName")}</Label>
                <Input
                  value={selectedStep.name ?? ""}
                  onChange={(e) => patchSelected({ name: e.target.value || undefined })}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <FlowPromptTemplateFields
                  template={selectedStep.template}
                  onTemplateChange={(v) => patchSelected({ template: v })}
                  priorOutputs={priorOutputsForTemplate}
                  argumentNames={argumentNames}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <FlowFieldLabelWithHelp
                  label={t("companySkills:workflowFlowFieldOutput")}
                  tooltip={t("companySkills:workflowFlowFieldOutputTooltip")}
                  htmlFor="wf-prompt-output"
                />
                <Input
                  id="wf-prompt-output"
                  value={selectedStep.output ?? ""}
                  onChange={(e) => patchSelected({ output: e.target.value.trim() || undefined })}
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {selectedStep?.kind === "checkpoint" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldMessage")}</Label>
                <Textarea
                  rows={3}
                  value={selectedStep.message}
                  onChange={(e) => patchSelected({ message: e.target.value })}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldOnApprove")}</Label>
                <Input
                  value={selectedStep.on_approve}
                  onChange={(e) => patchSelected({ on_approve: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldOnReject")}</Label>
                <Input
                  value={selectedStep.on_reject}
                  onChange={(e) => patchSelected({ on_reject: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {selectedStep?.kind === "condition" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldCondition")}</Label>
                <Input
                  value={selectedStep.condition}
                  onChange={(e) => patchSelected({ condition: e.target.value })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldIfTrue")}</Label>
                <Input
                  value={selectedStep.if_true}
                  onChange={(e) => patchSelected({ if_true: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldIfFalse")}</Label>
                <Input
                  value={selectedStep.if_false}
                  onChange={(e) => patchSelected({ if_false: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {selectedStep?.kind === "action" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldAction")}</Label>
                <Input value={selectedStep.action} readOnly disabled />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldParamsJson")}</Label>
                <Textarea
                  rows={3}
                  value={JSON.stringify(selectedStep.params, null, 0)}
                  onChange={(e) => {
                    try {
                      const p = JSON.parse(e.target.value || "{}") as Record<string, string>;
                      patchSelected({ params: p });
                    } catch {
                      /* invalid JSON */
                    }
                  }}
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {selectedStep?.kind === "loop" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldListFrom")}</Label>
                <Input
                  value={selectedStep.list_from}
                  onChange={(e) => patchSelected({ list_from: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldItemAs")}</Label>
                <Input
                  value={selectedStep.item_as}
                  onChange={(e) => patchSelected({ item_as: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldBodyIds")}</Label>
                <Input
                  value={selectedStep.body.join(", ")}
                  onChange={(e) => {
                    const body = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    patchSelected({ body });
                  }}
                  spellCheck={false}
                />
              </div>
            </>
          )}
          {selectedStep?.kind === "invoke_workflow" && (
            <>
              <div className="workflow-flow-editor-field">
                <Label className="workflow-flow-editor-field-label">{t("companySkills:workflowFlowFieldId")}</Label>
                <Input
                  value={selectedStep.id}
                  onChange={(e) => patchSelected({ id: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <FlowFieldLabelWithHelp
                  label={t("companySkills:workflowFlowFieldInvokeSkillKey")}
                  tooltip={t("companySkills:workflowFlowFieldInvokeSkillKeyTooltip")}
                  htmlFor="wf-invoke-skill-key"
                />
                <Input
                  id="wf-invoke-skill-key"
                  value={selectedStep.skill_key}
                  onChange={(e) => patchSelected({ skill_key: e.target.value.trim() })}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <FlowFieldLabelWithHelp
                  label={t("companySkills:workflowFlowFieldInvokeArgs")}
                  tooltip={t("companySkills:workflowFlowFieldInvokeArgsTooltip")}
                  htmlFor="wf-invoke-args"
                />
                <Textarea
                  id="wf-invoke-args"
                  rows={3}
                  value={(selectedStep.args ?? []).join("\n")}
                  onChange={(e) => {
                    const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                    patchSelected({ args: lines.length > 0 ? lines : undefined });
                  }}
                  spellCheck={false}
                />
              </div>
              <div className="workflow-flow-editor-field">
                <FlowFieldLabelWithHelp
                  label={t("companySkills:workflowFlowFieldOutput")}
                  tooltip={t("companySkills:workflowFlowFieldInvokeOutputTooltip")}
                  htmlFor="wf-invoke-output"
                />
                <Input
                  id="wf-invoke-output"
                  value={selectedStep.output ?? ""}
                  onChange={(e) => patchSelected({ output: e.target.value.trim() || undefined })}
                  spellCheck={false}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {parseError && steps.length > 0 && (
        <div className="workflow-flow-editor-error" role="alert">
          {parseError}
        </div>
      )}

      {flowContextMenu &&
        createPortal(
          <div
            ref={flowContextMenuRef}
            className="workflow-flow-context-menu"
            role="menu"
            aria-label={t("companySkills:workflowFlowContextMenuAria")}
            style={{
              position: "fixed",
              left: flowContextMenuFixed.left,
              top: flowContextMenuFixed.top,
              zIndex: 9999,
            }}
            onKeyDown={(e: ReactKeyboardEvent) => {
              const maxMainIndex = flowContextMenu.targetNodeId ? 1 : 0;
              const subLen = WORKFLOW_FLOW_EDITOR_STEP_KINDS.length;
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeFlowContextMenu();
                return;
              }
              if (menuNavFocus.zone === "main") {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus((f) =>
                    f.zone === "main"
                      ? { zone: "main", index: Math.min(maxMainIndex, f.index + 1) as 0 | 1 }
                      : f,
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus((f) =>
                    f.zone === "main" ? { zone: "main", index: Math.max(0, f.index - 1) as 0 | 1 } : f,
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (menuNavFocus.index === 0) handleAddPromptFromContext();
                  else if (menuNavFocus.index === 1 && flowContextMenu.targetNodeId) handleContextMenuDeleteStep();
                } else if (e.key === "ArrowRight" && menuNavFocus.index === 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus({ zone: "sub", index: 0 });
                }
              } else {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus((f) =>
                    f.zone === "sub" ? { zone: "sub", index: Math.min(subLen - 1, f.index + 1) } : f,
                  );
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus((f) =>
                    f.zone === "sub" ? { zone: "sub", index: Math.max(0, f.index - 1) } : f,
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  const entry = WORKFLOW_FLOW_EDITOR_STEP_KINDS[menuNavFocus.index];
                  if (entry) handleAddStepKindFromContext(entry.kind);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuNavFocus({ zone: "main", index: 0 });
                }
              }
            }}
          >
            <div className="workflow-flow-submenu-host">
              <button
                type="button"
                role="menuitem"
                data-menu-focus="main-0"
                className="workflow-flow-context-menu-item workflow-flow-context-menu-item--with-submenu"
                aria-haspopup="menu"
                aria-expanded={menuNavFocus.zone === "sub"}
                aria-controls="workflow-flow-add-step-submenu"
                tabIndex={menuNavFocus.zone === "main" && menuNavFocus.index === 0 ? 0 : -1}
                onClick={() => handleAddPromptFromContext()}
              >
                <span>{t("companySkills:workflowFlowAddStep")}</span>
                <ChevronRight className="workflow-flow-context-menu-chevron" aria-hidden />
              </button>
              <div
                id="workflow-flow-add-step-submenu"
                className="workflow-flow-context-submenu"
                role="menu"
                aria-label={t("companySkills:stepTypePickerTitle")}
              >
                {WORKFLOW_FLOW_EDITOR_STEP_KINDS.map((entry, idx) => (
                  <button
                    key={entry.kind}
                    type="button"
                    role="menuitem"
                    data-menu-focus={`sub-${idx}`}
                    className="workflow-flow-context-menu-item workflow-flow-context-submenu-item"
                    tabIndex={menuNavFocus.zone === "sub" && menuNavFocus.index === idx ? 0 : -1}
                    onClick={() => handleAddStepKindFromContext(entry.kind)}
                  >
                    <span className="workflow-flow-context-submenu-title">
                      {t(`companySkills:${entry.titleKey}`)}
                    </span>
                    <span className="workflow-flow-context-submenu-desc">
                      {t(`companySkills:${entry.descKey}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {flowContextMenu.targetNodeId ? (
              <button
                type="button"
                role="menuitem"
                data-menu-focus="main-1"
                className="workflow-flow-context-menu-item workflow-flow-context-menu-item--danger"
                tabIndex={menuNavFocus.zone === "main" && menuNavFocus.index === 1 ? 0 : -1}
                onClick={() => handleContextMenuDeleteStep()}
              >
                {t("companySkills:workflowFlowRemoveStep")}
              </button>
            ) : null}
          </div>,
          document.body,
        )}

      <p className="workflow-flow-editor-side-hint">{t("companySkills:workflowFlowHint")}</p>
    </div>
  );
}

export function WorkflowFlowEditor(props: WorkflowFlowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowFlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
