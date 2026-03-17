import { useState, useEffect, useRef, useCallback, useMemo, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { agentsApi } from "../api/agents";
import { authApi, isAuthSession } from "../api/auth";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { useProjectOrder } from "../hooks/useProjectOrder";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Maximize2,
  Minimize2,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  CircleDot,
  Minus,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Tag,
  Calendar,
  Paperclip,
  Loader2,
} from "lucide-react";
import { extractProviderIdWithFallback } from "../lib/model-utils";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { AgentIcon } from "./AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";

const DRAFT_KEY = "paperclip:issue-draft";
const DEBOUNCE_MS = 800;
// TODO(issue-worktree-support): re-enable this UI once the workflow is ready to ship.
const SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI = false;

/** Return black or white hex based on background luminance (WCAG perceptual weights). */
function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

interface IssueDraft {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  assigneeModelOverride: string;
  assigneeThinkingEffort: string;
  assigneeChrome: boolean;
  useIsolatedExecutionWorkspace: boolean;
  executionLabel: string;
}

const ISSUE_OVERRIDE_ADAPTER_TYPES = new Set([
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "opencode_local",
]);

const ISSUE_THINKING_EFFORT_OPTIONS: Record<
  string,
  Array<{ value: string; label: string }>
> = {
  claude_local: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  claude_remote: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_remote: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  opencode_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
} as const;

function buildAssigneeAdapterOverrides(input: {
  adapterType: string | null | undefined;
  modelOverride: string;
  thinkingEffortOverride: string;
  chrome: boolean;
}): Record<string, unknown> | null {
  const adapterType = input.adapterType ?? null;
  if (!adapterType || !ISSUE_OVERRIDE_ADAPTER_TYPES.has(adapterType)) {
    return null;
  }

  const adapterConfig: Record<string, unknown> = {};
  if (input.modelOverride) adapterConfig.model = input.modelOverride;
  if (input.thinkingEffortOverride) {
    if (adapterType === "codex_local" || adapterType === "codex_remote") {
      adapterConfig.modelReasoningEffort = input.thinkingEffortOverride;
    } else if (adapterType === "opencode_local") {
      adapterConfig.variant = input.thinkingEffortOverride;
    } else if (adapterType === "claude_local" || adapterType === "claude_remote") {
      adapterConfig.effort = input.thinkingEffortOverride;
    }
  }
  if ((adapterType === "claude_local" || adapterType === "claude_remote") && input.chrome) {
    adapterConfig.chrome = true;
  }

  const overrides: Record<string, unknown> = {};
  if (Object.keys(adapterConfig).length > 0) {
    overrides.adapterConfig = adapterConfig;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

function loadDraft(): IssueDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IssueDraft;
  } catch {
    return null;
  }
}

function saveDraft(draft: IssueDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

const STATUS_VALUES = [
  { value: "backlog", labelKey: "status.backlog" },
  { value: "todo", labelKey: "status.todo" },
  { value: "in_progress", labelKey: "status.inProgress" },
  { value: "in_review", labelKey: "status.inReview" },
  { value: "done", labelKey: "status.done" },
];

const PRIORITY_VALUES = [
  { value: "critical", labelKey: "dashboard.priorityCritical", icon: AlertTriangle },
  { value: "high", labelKey: "dashboard.priorityHigh", icon: ArrowUp },
  { value: "medium", labelKey: "dashboard.priorityMedium", icon: Minus },
  { value: "low", labelKey: "dashboard.priorityLow", icon: ArrowDown },
];

export function NewIssueDialog() {
  const { t } = useTranslation();
  const { newIssueOpen, newIssueDefaults, closeNewIssue } = useDialog();
  const { companies, selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();

  const statuses = useMemo(
    () => STATUS_VALUES.map((s) => ({ ...s, label: t(s.labelKey) })),
    [t],
  );
  const priorities = useMemo(
    () => PRIORITY_VALUES.map((p) => ({ ...p, label: t(p.labelKey) })),
    [t],
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeOptionsOpen, setAssigneeOptionsOpen] = useState(false);
  const [assigneeModelOverride, setAssigneeModelOverride] = useState("");
  const [assigneeThinkingEffort, setAssigneeThinkingEffort] = useState("");
  const [assigneeChrome, setAssigneeChrome] = useState(false);
  const [useIsolatedExecutionWorkspace, setUseIsolatedExecutionWorkspace] = useState(false);
  const [executionLabel, setExecutionLabel] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [dialogCompanyId, setDialogCompanyId] = useState<string | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const executionWorkspaceDefaultProjectId = useRef<string | null>(null);

  const effectiveCompanyId = dialogCompanyId ?? selectedCompanyId;
  const dialogCompany = companies.find((c) => c.id === effectiveCompanyId) ?? selectedCompany;

  // Popover states
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(effectiveCompanyId!),
    queryFn: () => agentsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(effectiveCompanyId!),
    queryFn: () => projectsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId && newIssueOpen,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });
  const currentUserId = isAuthSession(session) ? session.user?.id ?? session.session?.userId ?? null : null;
  const { orderedProjects } = useProjectOrder({
    projects: projects ?? [],
    companyId: effectiveCompanyId,
    userId: currentUserId,
  });

  const assigneeAdapterType = (agents ?? []).find((agent) => agent.id === assigneeId)?.adapterType ?? null;
  const supportsAssigneeOverrides = Boolean(
    assigneeAdapterType && ISSUE_OVERRIDE_ADAPTER_TYPES.has(assigneeAdapterType),
  );
  const mentionOptions = useMemo<MentionOption[]>(() => {
    const options: MentionOption[] = [];
    const activeAgents = [...(agents ?? [])]
      .filter((agent) => agent.status !== "terminated")
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const agent of activeAgents) {
      options.push({
        id: `agent:${agent.id}`,
        name: agent.name,
        kind: "agent",
      });
    }
    for (const project of orderedProjects) {
      options.push({
        id: `project:${project.id}`,
        name: project.name,
        kind: "project",
        projectId: project.id,
        projectColor: project.color,
      });
    }
    return options;
  }, [agents, orderedProjects]);

  const { data: assigneeAdapterModels } = useQuery({
    queryKey:
      effectiveCompanyId && assigneeAdapterType
        ? queryKeys.agents.adapterModels(effectiveCompanyId, assigneeAdapterType)
        : ["agents", "none", "adapter-models", assigneeAdapterType ?? "none"],
    queryFn: () => agentsApi.adapterModels(effectiveCompanyId!, assigneeAdapterType!),
    enabled: Boolean(effectiveCompanyId) && newIssueOpen && supportsAssigneeOverrides,
  });

  const createIssue = useMutation({
    mutationFn: ({ companyId, ...data }: { companyId: string } & Record<string, unknown>) =>
      issuesApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(effectiveCompanyId!) });
      if (draftTimer.current) clearTimeout(draftTimer.current);
      clearDraft();
      reset();
      closeNewIssue();
    },
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!effectiveCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(effectiveCompanyId, file, "issues/drafts");
    },
  });

  // Debounced draft saving
  const scheduleSave = useCallback(
    (draft: IssueDraft) => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(() => {
        if (draft.title.trim()) saveDraft(draft);
      }, DEBOUNCE_MS);
    },
    [],
  );

  // Save draft on meaningful changes
  useEffect(() => {
    if (!newIssueOpen) return;
    scheduleSave({
      title,
      description,
      status,
      priority,
      assigneeId,
      projectId,
      assigneeModelOverride,
      assigneeThinkingEffort,
      assigneeChrome,
      useIsolatedExecutionWorkspace,
      executionLabel,
    });
  }, [
    title,
    description,
    status,
    priority,
    assigneeId,
    projectId,
    assigneeModelOverride,
    assigneeThinkingEffort,
    assigneeChrome,
    useIsolatedExecutionWorkspace,
    executionLabel,
    newIssueOpen,
    scheduleSave,
  ]);

  // Restore draft or apply defaults when dialog opens
  useEffect(() => {
    if (!newIssueOpen) return;
    setDialogCompanyId(selectedCompanyId);
    executionWorkspaceDefaultProjectId.current = null;

    const draft = loadDraft();
    if (newIssueDefaults.title) {
      setTitle(newIssueDefaults.title);
      setDescription(newIssueDefaults.description ?? "");
      setStatus(newIssueDefaults.status ?? "todo");
      setPriority(newIssueDefaults.priority ?? "");
      setProjectId(newIssueDefaults.projectId ?? "");
      setAssigneeId(newIssueDefaults.assigneeAgentId ?? "");
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      setUseIsolatedExecutionWorkspace(false);
      setExecutionLabel("");
    } else if (draft && draft.title.trim()) {
      setTitle(draft.title);
      setDescription(draft.description);
      setStatus(draft.status || "todo");
      setPriority(draft.priority);
      setAssigneeId(newIssueDefaults.assigneeAgentId ?? draft.assigneeId);
      setProjectId(newIssueDefaults.projectId ?? draft.projectId);
      setAssigneeModelOverride(draft.assigneeModelOverride ?? "");
      setAssigneeThinkingEffort(draft.assigneeThinkingEffort ?? "");
      setAssigneeChrome(draft.assigneeChrome ?? false);
      setUseIsolatedExecutionWorkspace(draft.useIsolatedExecutionWorkspace ?? false);
      setExecutionLabel(draft.executionLabel ?? "");
    } else {
      setStatus(newIssueDefaults.status ?? "todo");
      setPriority(newIssueDefaults.priority ?? "");
      setProjectId(newIssueDefaults.projectId ?? "");
      setAssigneeId(newIssueDefaults.assigneeAgentId ?? "");
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      setUseIsolatedExecutionWorkspace(false);
      setExecutionLabel("");
    }
  }, [newIssueOpen, newIssueDefaults]);

  useEffect(() => {
    if (!supportsAssigneeOverrides) {
      setAssigneeOptionsOpen(false);
      setAssigneeModelOverride("");
      setAssigneeThinkingEffort("");
      setAssigneeChrome(false);
      return;
    }

    const validThinkingValues =
      ISSUE_THINKING_EFFORT_OPTIONS[assigneeAdapterType ?? ""] ??
      ISSUE_THINKING_EFFORT_OPTIONS.claude_local;
    if (!validThinkingValues.some((option) => option.value === assigneeThinkingEffort)) {
      setAssigneeThinkingEffort("");
    }
  }, [supportsAssigneeOverrides, assigneeAdapterType, assigneeThinkingEffort]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  function reset() {
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("");
    setAssigneeId("");
    setProjectId("");
    setAssigneeOptionsOpen(false);
    setAssigneeModelOverride("");
    setAssigneeThinkingEffort("");
    setAssigneeChrome(false);
    setUseIsolatedExecutionWorkspace(false);
    setExpanded(false);
    setDialogCompanyId(null);
    setCompanyOpen(false);
    executionWorkspaceDefaultProjectId.current = null;
  }

  function handleCompanyChange(companyId: string) {
    if (companyId === effectiveCompanyId) return;
    setDialogCompanyId(companyId);
    setAssigneeId("");
    setProjectId("");
    setAssigneeModelOverride("");
    setAssigneeThinkingEffort("");
    setAssigneeChrome(false);
    setUseIsolatedExecutionWorkspace(false);
  }

  function discardDraft() {
    clearDraft();
    reset();
    closeNewIssue();
  }

  function handleSubmit() {
    if (!effectiveCompanyId || !title.trim() || createIssue.isPending) return;
    const assigneeAdapterOverrides = buildAssigneeAdapterOverrides({
      adapterType: assigneeAdapterType,
      modelOverride: assigneeModelOverride,
      thinkingEffortOverride: assigneeThinkingEffort,
      chrome: assigneeChrome,
    });
    const selectedProject = orderedProjects.find((project) => project.id === projectId);
    const executionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
      ? selectedProject?.executionWorkspacePolicy
      : null;
    const executionWorkspaceSettings = executionWorkspacePolicy?.enabled
      ? {
          mode: useIsolatedExecutionWorkspace ? "isolated" : "project_primary",
        }
      : null;
    createIssue.mutate({
      companyId: effectiveCompanyId,
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority: priority || "medium",
      ...(assigneeId ? { assigneeAgentId: assigneeId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(assigneeAdapterOverrides ? { assigneeAdapterOverrides } : {}),
      ...(executionWorkspaceSettings ? { executionWorkspaceSettings } : {}),
      ...(executionLabel.trim() ? { executionLabel: executionLabel.trim() } : {}),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function handleAttachImage(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      const asset = await uploadDescriptionImage.mutateAsync(file);
      const name = file.name || "image";
      setDescription((prev) => {
        const suffix = `![${name}](${asset.contentPath})`;
        return prev ? `${prev}\n\n${suffix}` : suffix;
      });
    } finally {
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const hasDraft = title.trim().length > 0 || description.trim().length > 0;
  const currentStatus = statuses.find((s) => s.value === status) ?? statuses[1]!;
  const currentPriority = priorities.find((p) => p.value === priority);
  const currentAssignee = (agents ?? []).find((a) => a.id === assigneeId);
  const currentProject = orderedProjects.find((project) => project.id === projectId);
  const currentProjectExecutionWorkspacePolicy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI
    ? currentProject?.executionWorkspacePolicy ?? null
    : null;
  const currentProjectSupportsExecutionWorkspace = Boolean(currentProjectExecutionWorkspacePolicy?.enabled);
  const assigneeOptionsTitle =
    assigneeAdapterType === "claude_local"
      ? t("newIssue.claudeOptions")
      : assigneeAdapterType === "codex_local"
        ? t("newIssue.codexOptions")
        : assigneeAdapterType === "opencode_local"
          ? t("newIssue.opencodeOptions")
          : t("newIssue.agentOptions");
  const thinkingEffortOptions =
    ISSUE_THINKING_EFFORT_OPTIONS[assigneeAdapterType ?? ""] ??
    ISSUE_THINKING_EFFORT_OPTIONS.claude_local;
  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [newIssueOpen]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      orderedProjects.map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [orderedProjects],
  );
  const savedDraft = loadDraft();
  const hasSavedDraft = Boolean(savedDraft?.title.trim() || savedDraft?.description.trim());
  const canDiscardDraft = hasDraft || hasSavedDraft;
  const createIssueErrorMessage =
    createIssue.error instanceof Error ? createIssue.error.message : "Failed to create issue. Try again.";

  const handleProjectChange = useCallback((nextProjectId: string) => {
    setProjectId(nextProjectId);
    const nextProject = orderedProjects.find((project) => project.id === nextProjectId);
    const policy = SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI ? nextProject?.executionWorkspacePolicy : null;
    executionWorkspaceDefaultProjectId.current = nextProjectId || null;
    setUseIsolatedExecutionWorkspace(Boolean(policy?.enabled && policy.defaultMode === "isolated"));
  }, [orderedProjects]);

  useEffect(() => {
    if (!newIssueOpen || !projectId || executionWorkspaceDefaultProjectId.current === projectId) {
      return;
    }
    const project = orderedProjects.find((entry) => entry.id === projectId);
    if (!project) return;
    executionWorkspaceDefaultProjectId.current = projectId;
    setUseIsolatedExecutionWorkspace(
      Boolean(
        SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI &&
        project.executionWorkspacePolicy?.enabled &&
        project.executionWorkspacePolicy.defaultMode === "isolated",
      ),
    );
  }, [newIssueOpen, orderedProjects, projectId]);
  const modelOverrideOptions = useMemo<InlineEntityOption[]>(
    () => {
      return [...(assigneeAdapterModels ?? [])]
        .sort((a, b) => {
          const providerA = extractProviderIdWithFallback(a.id);
          const providerB = extractProviderIdWithFallback(b.id);
          const byProvider = providerA.localeCompare(providerB);
          if (byProvider !== 0) return byProvider;
          return a.id.localeCompare(b.id);
        })
        .map((model) => ({
          id: model.id,
          label: model.label,
          searchText: `${model.id} ${extractProviderIdWithFallback(model.id)}`,
        }));
    },
    [assigneeAdapterModels],
  );

  return (
    <Dialog
      open={newIssueOpen}
      onOpenChange={(open) => {
        if (!open && !createIssue.isPending) closeNewIssue();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={["ui-new-issue-dialog-content", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
        onEscapeKeyDown={(event) => {
          if (createIssue.isPending) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (createIssue.isPending) {
            event.preventDefault();
            return;
          }
          // Radix Dialog's modal DismissableLayer calls preventDefault() on
          // pointerdown events that originate outside the Dialog DOM tree.
          // Popover portals render at the body level (outside the Dialog), so
          // touch events on popover content get their default prevented — which
          // kills scroll gesture recognition on mobile.  Telling Radix "this
          // event is handled" skips that preventDefault, restoring touch scroll.
          const target = event.detail.originalEvent.target as HTMLElement | null;
          if (target?.closest("[data-radix-popper-content-wrapper]")) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="sr-only">{t("nav.newIssue")}</DialogTitle>
        {/* Header bar */}
        <div className="ui-form-dialog-header">
          <div className="ui-form-dialog-header-left">
            <Popover open={companyOpen} onOpenChange={setCompanyOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ui-new-issue-company-trigger"
                  style={
                    dialogCompany?.brandColor
                      ? {
                          backgroundColor: dialogCompany.brandColor,
                          color: getContrastTextColor(dialogCompany.brandColor),
                        }
                      : undefined
                  }
                >
                  {(dialogCompany?.name ?? "").slice(0, 3).toUpperCase()}
                </button>
              </PopoverTrigger>
              <PopoverContent className="ui-form-dialog-popover-content w-48" align="start">
                {companies.filter((c) => c.status !== "archived").map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={["ui-form-dialog-popover-item", c.id === effectiveCompanyId ? "active" : ""].filter(Boolean).join(" ")}
                    onClick={() => {
                      handleCompanyChange(c.id);
                      setCompanyOpen(false);
                    }}
                  >
                    <span
                      className="ui-new-issue-company-option-badge"
                      style={
                        c.brandColor
                          ? {
                              backgroundColor: c.brandColor,
                              color: getContrastTextColor(c.brandColor),
                            }
                          : undefined
                      }
                    >
                      {c.name.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="ui-new-issue-trigger-inner">{c.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <span className="ui-form-dialog-header-sep">&rsaquo;</span>
            <span>{t("newIssue.title")}</span>
          </div>
          <div className="ui-form-dialog-header-actions">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setExpanded(!expanded)}
              disabled={createIssue.isPending}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => closeNewIssue()}
              disabled={createIssue.isPending}
            >
              <span className="ui-form-dialog-close-char">&times;</span>
            </Button>
          </div>
        </div>

        {/* Title */}
        <div className="ui-form-dialog-title-wrap">
          <textarea
            className="ui-form-dialog-title-input ui-new-issue-title-textarea"
            placeholder={t("newIssue.issueTitle")}
            rows={1}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            readOnly={createIssue.isPending}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.metaKey &&
                !e.ctrlKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                descriptionEditorRef.current?.focus();
              }
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                assigneeSelectorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        <div className="ui-new-issue-section">
          <div className="ui-new-issue-assignee-row">
            <div className="ui-new-issue-assignee-row-inner">
              <span>{t("newIssue.for")}</span>
              <InlineEntitySelector
                ref={assigneeSelectorRef}
                value={assigneeId}
                options={assigneeOptions}
                placeholder={t("properties.assignee")}
                disablePortal
                noneLabel={t("properties.noAssignee")}
                searchPlaceholder={t("properties.searchAssignees")}
                emptyMessage={t("newIssue.noAssigneesFound")}
                onChange={(id) => { if (id) trackRecentAssignee(id); setAssigneeId(id); }}
                onConfirm={() => {
                  projectSelectorRef.current?.focus();
                }}
                renderTriggerValue={(option) =>
                  option && currentAssignee ? (
                    <>
                      <AgentIcon icon={currentAssignee.icon} className="ui-new-issue-chip-muted" />
                      <span className="ui-new-issue-trigger-inner">{option.label}</span>
                    </>
                  ) : (
                    <span className="ui-new-issue-chip-muted">{t("properties.assignee")}</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="ui-new-issue-trigger-inner">{option.label}</span>;
                  const assignee = (agents ?? []).find((agent) => agent.id === option.id);
                  return (
                    <>
                      <AgentIcon icon={assignee?.icon} className="ui-new-issue-chip-muted" />
                      <span className="ui-new-issue-trigger-inner">{option.label}</span>
                    </>
                  );
                }}
              />
              <span>{t("newIssue.in")}</span>
              <InlineEntitySelector
                ref={projectSelectorRef}
                value={projectId}
                options={projectOptions}
                placeholder={t("properties.project")}
                disablePortal
                noneLabel={t("properties.noProject")}
                searchPlaceholder={t("properties.searchProjects")}
                emptyMessage={t("newIssue.noProjectsFound")}
                onChange={handleProjectChange}
                onConfirm={() => {
                  descriptionEditorRef.current?.focus();
                }}
                renderTriggerValue={(option) =>
                  option && currentProject ? (
                    <>
                      <span
                        className="ui-new-issue-project-color"
                        style={{ backgroundColor: currentProject.color ?? "#6366f1" }}
                      />
                      <span className="ui-new-issue-trigger-inner">{option.label}</span>
                    </>
                  ) : (
                    <span className="ui-new-issue-chip-muted">{t("properties.project")}</span>
                  )
                }
                renderOption={(option) => {
                  if (!option.id) return <span className="ui-new-issue-trigger-inner">{option.label}</span>;
                  const project = orderedProjects.find((item) => item.id === option.id);
                  return (
                    <>
                      <span
                        className="ui-new-issue-project-color"
                        style={{ backgroundColor: project?.color ?? "#6366f1" }}
                      />
                      <span className="ui-new-issue-trigger-inner">{option.label}</span>
                    </>
                  );
                }}
              />
            </div>
          </div>
        </div>

        {currentProjectSupportsExecutionWorkspace && (
          <div className="ui-new-issue-section">
            <div className="ui-new-issue-toggle-row">
              <div className="ui-new-issue-toggle-row-caption">
                <div className="ui-new-issue-toggle-row-title">{t("newIssue.useIsolatedCheckout")}</div>
                <div className="ui-new-issue-toggle-row-hint">
                  {t("newIssue.useIsolatedCheckoutHint")}
                </div>
              </div>
              <button
                type="button"
                className={["ui-new-issue-toggle", useIsolatedExecutionWorkspace ? "on" : ""].filter(Boolean).join(" ")}
                onClick={() => setUseIsolatedExecutionWorkspace((value) => !value)}
              >
                <span className="ui-new-issue-toggle-thumb" />
              </button>
            </div>
          </div>
        )}

        <div className="ui-new-issue-section">
          <label className="ui-new-issue-section-label">{t("newIssue.executionLabelOptional")}</label>
          <input
            type="text"
            className="ui-new-issue-input"
            placeholder={t("newIssue.executionLabelPlaceholder")}
            maxLength={64}
            value={executionLabel}
            onChange={(e) => setExecutionLabel(e.target.value)}
          />
        </div>

        {supportsAssigneeOverrides && (
          <div className="ui-new-issue-section">
            <button
              type="button"
              className="ui-new-issue-options-trigger"
              onClick={() => setAssigneeOptionsOpen((open) => !open)}
            >
              {assigneeOptionsOpen ? <ChevronDown /> : <ChevronRight />}
              {assigneeOptionsTitle}
            </button>
            {assigneeOptionsOpen && (
              <div className="ui-new-issue-options-panel">
                <div className="ui-new-issue-options-field">
                  <div className="ui-new-issue-options-field-label">{t("newIssue.model")}</div>
                  <InlineEntitySelector
                    value={assigneeModelOverride}
                    options={modelOverrideOptions}
                    placeholder={t("newIssue.defaultModel")}
                    disablePortal
                    noneLabel={t("newIssue.defaultModel")}
                    searchPlaceholder={t("newIssue.searchModels")}
                    emptyMessage={t("newIssue.noModelsFound")}
                    onChange={setAssigneeModelOverride}
                  />
                </div>
                <div className="ui-new-issue-options-field">
                  <div className="ui-new-issue-options-field-label">{t("newIssue.thinkingEffort")}</div>
                  <div className="ui-new-issue-thinking-options">
                    {thinkingEffortOptions.map((option) => (
                      <button
                        key={option.value || "default"}
                        type="button"
                        className={["ui-new-issue-thinking-option", assigneeThinkingEffort === option.value ? "active" : ""].filter(Boolean).join(" ")}
                        onClick={() => setAssigneeThinkingEffort(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                {assigneeAdapterType === "claude_local" && (
                  <div className="ui-new-issue-toggle-row">
                    <div className="ui-new-issue-options-field-label">{t("newIssue.enableChrome")}</div>
                    <button
                      type="button"
                      className={["ui-new-issue-toggle", assigneeChrome ? "on" : ""].filter(Boolean).join(" ")}
                      onClick={() => setAssigneeChrome((value) => !value)}
                    >
                      <span className="ui-new-issue-toggle-thumb" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className={["ui-new-issue-description-wrap", expanded ? "expanded" : ""].filter(Boolean).join(" ")}>
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder={t("newIssue.addDescription")}
            bordered={false}
            mentions={mentionOptions}
            contentClassName={["ui-form-dialog-content-editor", "pb-12", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        {/* Property chips bar */}
        <div className="ui-new-issue-chips-bar">
          {/* Status chip */}
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <CircleDot className="ui-new-issue-chip-dot" data-status={status} />
                {currentStatus.label}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-40" align="start">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={["ui-form-dialog-popover-item", s.value === status ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setStatus(s.value); setStatusOpen(false); }}
                >
                  <CircleDot className="ui-new-issue-chip-dot" data-status={s.value} />
                  {s.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Priority chip */}
          <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                {currentPriority ? (
                  <>
                    <currentPriority.icon className="ui-new-issue-chip-dot" data-priority={currentPriority.value} />
                    {currentPriority.label}
                  </>
                ) : (
                  <>
                    <Minus className="ui-new-issue-chip-muted" />
                    {t("properties.priority")}
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-40" align="start">
              {priorities.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={["ui-form-dialog-popover-item", p.value === priority ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setPriority(p.value); setPriorityOpen(false); }}
                >
                  <p.icon className="ui-new-issue-chip-dot" data-priority={p.value} />
                  {p.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Labels chip (placeholder) */}
          <button type="button" className="ui-form-dialog-chip ui-new-issue-chip-muted">
            <Tag className="ui-new-issue-chip-muted" />
            {t("newIssue.labels")}
          </button>

          {/* Attach image chip */}
          <input
            ref={attachInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="ui-new-issue-file-input"
            onChange={handleAttachImage}
          />
          <button
            type="button"
            className="ui-form-dialog-chip ui-new-issue-chip-muted"
            onClick={() => attachInputRef.current?.click()}
            disabled={uploadDescriptionImage.isPending}
          >
            <Paperclip />
            {uploadDescriptionImage.isPending ? t("newIssue.uploading") : t("newIssue.image")}
          </button>

          {/* More (dates) */}
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip ui-new-issue-chip-muted ui-new-issue-more-trigger">
                <MoreHorizontal />
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-44" align="start">
              <button type="button" className="ui-form-dialog-popover-item ui-form-dialog-popover-item-muted">
                <Calendar className="ui-new-issue-chip-muted" />
                {t("newIssue.startDate")}
              </button>
              <button type="button" className="ui-form-dialog-popover-item ui-form-dialog-popover-item-muted">
                <Calendar className="ui-new-issue-chip-muted" />
                {t("newIssue.dueDate")}
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Footer */}
        <div className="ui-form-dialog-footer ui-form-dialog-footer-between">
          <Button
            variant="ghost"
            size="sm"
            className="ui-new-issue-chip-muted"
            onClick={discardDraft}
            disabled={createIssue.isPending || !canDiscardDraft}
          >
            {t("newIssue.discardDraft")}
          </Button>
          <div className="ui-new-issue-footer-actions">
            <div className="ui-new-issue-footer-status">
              {createIssue.isPending ? (
                <span className="ui-new-issue-footer-loading">
                  <Loader2 className="ui-new-issue-spin" />
                  {t("newIssue.creatingIssue")}
                </span>
              ) : createIssue.isError ? (
                <span className="ui-form-dialog-footer-error">{createIssueErrorMessage}</span>
              ) : null}
            </div>
            <Button
              size="sm"
              className="ui-new-issue-submit-btn"
              disabled={!title.trim() || createIssue.isPending}
              onClick={handleSubmit}
              aria-busy={createIssue.isPending}
            >
              <span className="ui-new-issue-submit-inner">
                {createIssue.isPending ? <Loader2 className="ui-new-issue-spin" /> : null}
                <span>{createIssue.isPending ? t("newIssue.creating") : t("newIssue.createIssue")}</span>
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
