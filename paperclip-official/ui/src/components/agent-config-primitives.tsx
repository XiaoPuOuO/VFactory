import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { AGENT_ROLE_LABELS } from "@paperclipai/shared";

/* ---- Help text for (?) tooltips ---- */
export const help: Record<string, string> = {
  name: "Display name for this agent.",
  title: "Job title shown in the org chart.",
  role: "Organizational role. Determines position and capabilities.",
  reportsTo: "The agent this one reports to in the org hierarchy.",
  capabilities: "Describes what this agent can do. Shown in the org chart and used for task routing.",
  adapterType: "How this agent runs: local CLI (Claude/Codex/OpenCode), OpenClaw Gateway, spawned process, or generic HTTP webhook.",
  cwd: "Default working directory fallback for local adapters. Use an absolute path on the machine running VFactory.",
  cwdAdminOnly: "Only instance admins can set working directory.",
  promptTemplate:
    "The prompt sent to the agent on each heartbeat. Supports {{ agent.id }}, {{ agent.name }}, {{ agent.role }}, {{ agent.title }}, {{ agent.capabilities }} (or leave capabilities out of the template and VFactory will append the saved 能力描述 automatically).",
  model: "Override the default model used by the adapter.",
  thinkingEffort: "Control model reasoning depth. Supported values vary by adapter/model.",
  chrome: "Enable Claude's Chrome integration by passing --chrome.",
  dangerouslySkipPermissions: "Run Claude without permission prompts. Required for unattended operation.",
  dangerouslyBypassSandbox: "Run Codex without sandbox restrictions. Required for filesystem/network access.",
  search: "Enable Codex web search capability during runs.",
  workspaceStrategy: "How VFactory should realize an execution workspace for this agent. Keep project_primary for normal cwd execution, or use git_worktree for issue-scoped isolated checkouts.",
  workspaceBaseRef: "Base git ref used when creating a worktree branch. Leave blank to use the resolved workspace ref or HEAD.",
  workspaceBranchTemplate: "Template for naming derived branches. Supports {{issue.identifier}}, {{issue.title}}, {{agent.name}}, {{project.id}}, {{workspace.repoRef}}, and {{slug}}.",
  worktreeParentDir: "Directory where derived worktrees should be created. Absolute, ~-prefixed, and repo-relative paths are supported.",
  runtimeServicesJson: "Optional workspace runtime service definitions. Use this for shared app servers, workers, or other long-lived companion processes attached to the workspace.",
  maxTurnsPerRun: "Maximum number of agentic turns (tool calls) per heartbeat run.",
  command: "The command to execute (e.g. node, python).",
  localCommand: "Override the path to the CLI command you want the adapter to call (e.g. /usr/local/bin/claude, codex, opencode).",
  args: "Command-line arguments, comma-separated.",
  extraArgs: "Extra CLI arguments for local adapters, comma-separated.",
  envVars: "Environment variables injected into the adapter process. Use plain values or secret references.",
  bootstrapPrompt: "Optional prompt prepended on the first run to bootstrap the agent's environment or habits.",
  payloadTemplateJson: "Optional JSON merged into remote adapter request payloads before VFactory adds its standard wake and workspace fields.",
  webhookUrl: "The URL that receives POST requests when the agent is invoked.",
  heartbeatInterval: "Run this agent automatically on a timer. Useful for periodic tasks like checking for new work.",
  intervalSec: "Seconds between automatic heartbeat invocations.",
  timeoutSec: "Maximum seconds a run can take before being terminated. 0 means no timeout.",
  graceSec: "Seconds to wait after sending interrupt before force-killing the process.",
  wakeOnDemand: "Allow this agent to be woken by assignments, API calls, UI actions, or automated systems.",
  cooldownSec: "Minimum seconds between consecutive heartbeat runs.",
  maxConcurrentRuns: "Maximum number of heartbeat runs that can execute simultaneously for this agent.",
  budgetMonthlyCents: "Monthly spending limit in cents. 0 means no limit.",
};

export const adapterLabels: Record<string, string> = {
  claude_local: "Claude (local)",
  claude_remote: "Claude (remote)",
  codex_local: "Codex (local)",
  codex_remote: "Codex (remote)",
  gemini_local: "Gemini CLI (local)",
  gemini_remote: "Gemini (remote)",
  opencode_local: "OpenCode (local)",
  openclaw_gateway: "OpenClaw Gateway",
  cursor: "Cursor (local)",
  process: "Process",
  http: "HTTP",
};

export const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

/* ---- Primitive components ---- */

export function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="ui-agent-hint-btn" aria-label="Help">
          <HelpCircle aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="ui-agent-tooltip-content">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="ui-agent-field-row">
        <label className="ui-agent-field-label">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      {children}
    </div>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ui-agent-toggle-row">
      <div className="ui-agent-toggle-label-row">
        <span className="ui-agent-field-label">{label}</span>
        {hint && <HintIcon text={hint} />}
      </div>
      <button
        type="button"
        className="ui-agent-switch"
        data-checked={checked}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onChange(!checked);
        }}
        aria-checked={checked}
      >
        <span className="ui-agent-switch-thumb" aria-hidden />
      </button>
    </div>
  );
}

export function ToggleWithNumber({
  label,
  hint,
  checked,
  onCheckedChange,
  number,
  onNumberChange,
  numberLabel,
  numberHint,
  numberPrefix,
  showNumber,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  number: number;
  onNumberChange: (v: number) => void;
  numberLabel: string;
  numberHint?: string;
  numberPrefix?: string;
  showNumber: boolean;
}) {
  return (
    <div className="ui-agent-space-y-2">
      <div className="ui-agent-number-inner">
        <div className="ui-agent-toggle-label-row">
          <span className="ui-agent-field-label">{label}</span>
          {hint && <HintIcon text={hint} />}
        </div>
        <button
          type="button"
          className="ui-agent-switch"
          data-checked={checked}
          onClick={() => onCheckedChange(!checked)}
          aria-checked={checked}
        >
          <span className="ui-agent-switch-thumb" aria-hidden />
        </button>
      </div>
      {showNumber && (
        <div className="ui-agent-number-suffix">
          {numberPrefix && <span>{numberPrefix}</span>}
          <input
            type="number"
            className="ui-agent-number-input"
            value={number}
            onChange={(e) => onNumberChange(Number(e.target.value))}
          />
          <span>{numberLabel}</span>
          {numberHint && <HintIcon text={numberHint} />}
        </div>
      )}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  bordered,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  bordered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={bordered ? "ui-agent-collapse-border" : undefined}>
      <button
        className="ui-agent-collapse-trigger"
        onClick={onToggle}
      >
        {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
        {icon}
        {title}
      </button>
      {open && <div className="ui-agent-collapse-content">{children}</div>}
    </div>
  );
}

export function AutoExpandTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="ui-agent-mono-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      style={{ minHeight }}
    />
  );
}

/**
 * Text input that manages internal draft state.
 * Calls `onCommit` on blur (and optionally on every change if `immediate` is set).
 */
export function DraftInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      {...props}
    />
  );
}

/**
 * Auto-expanding textarea with draft state and blur-commit.
 */
export function DraftTextarea({
  value,
  onCommit,
  immediate,
  placeholder,
  minRows,
}: {
  value: string;
  onCommit: (v: string) => void;
  immediate?: boolean;
  placeholder?: string;
  minRows?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rows = minRows ?? 3;
  const lineHeight = 20;
  const minHeight = rows * lineHeight;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => { adjustHeight(); }, [draft, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      className="ui-agent-mono-input"
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      style={{ minHeight }}
    />
  );
}

/**
 * Number input with draft state and blur-commit.
 */
export function DraftNumberInput({
  value,
  onCommit,
  immediate,
  className,
  ...props
}: {
  value: number;
  onCommit: (v: number) => void;
  immediate?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "type">) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (immediate) onCommit(Number(e.target.value) || 0);
      }}
      onBlur={() => {
        const num = Number(draft) || 0;
        if (num !== value) onCommit(num);
      }}
      {...props}
    />
  );
}

/**
 * "Choose" button that opens a dialog explaining the user must manually
 * type the path due to browser security limitations.
 */
export function ChoosePathButton({ disabled }: { disabled?: boolean } = {}) {
  const { t } = useTranslation(["pathInstructions", "common"]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={"ui-agent-choose-btn" + (disabled ? " opacity-50 cursor-not-allowed" : "")}
        onClick={() => !disabled && setOpen(true)}
      >
        {t("common:choose")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pathInstructions:manualTitle")}</DialogTitle>
            <DialogDescription>
              {t("pathInstructions:manualDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="ui-agent-path-dialog-body">
            <section className="ui-agent-path-dialog-section">
              <p className="ui-agent-path-dialog-title">{t("pathInstructions:macSectionTitle")}</p>
              <ol className="ui-agent-path-dialog-ol">
                <li>{t("pathInstructions:macManualStep1")}</li>
                <li>{t("pathInstructions:macManualStep2")}</li>
                <li>{t("pathInstructions:macManualStep3")}</li>
                <li>{t("pathInstructions:macManualStep4")}</li>
              </ol>
              <p className="ui-agent-path-dialog-code">/Users/yourname/Documents/project</p>
            </section>
            <section className="ui-agent-path-dialog-section">
              <p className="ui-agent-path-dialog-title">{t("pathInstructions:windowsSectionTitle")}</p>
              <ol className="ui-agent-path-dialog-ol">
                <li>{t("pathInstructions:windowsManualStep1")}</li>
                <li>{t("pathInstructions:windowsManualStep2")}</li>
                <li>{t("pathInstructions:windowsManualStep3")}</li>
                <li>{t("pathInstructions:windowsManualStep4")}</li>
              </ol>
              <p className="ui-agent-path-dialog-code">C:\Users\yourname\Documents\project</p>
            </section>
            <section className="ui-agent-path-dialog-section">
              <p className="ui-agent-path-dialog-title">{t("pathInstructions:terminalSectionTitle")}</p>
              <ol className="ui-agent-path-dialog-ol">
                <li>{t("pathInstructions:terminalStep1")}</li>
                <li>{t("pathInstructions:terminalStep2")}</li>
                <li>{t("pathInstructions:terminalStep3")}</li>
              </ol>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("pathInstructions:ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Label + input rendered on the same line (inline layout for compact fields).
 */
export function InlineField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="ui-agent-inline-field">
      <div className="ui-agent-inline-field-label-wrap">
        <label className="ui-agent-field-label">{label}</label>
        {hint && <HintIcon text={hint} />}
      </div>
      <div className="ui-agent-inline-field-input">{children}</div>
    </div>
  );
}
