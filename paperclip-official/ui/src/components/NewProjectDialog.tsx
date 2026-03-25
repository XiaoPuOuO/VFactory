import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { projectsApi } from "../api/projects";
import { goalsApi } from "../api/goals";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
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
  Target,
  Calendar,
  Plus,
  X,
  FolderOpen,
  Github,
  GitBranch,
} from "lucide-react";
import { PROJECT_COLORS } from "@paperclipai/shared";
import { MarkdownEditor, type MarkdownEditorRef } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { ChoosePathButton } from "./PathInstructionsModal";

const PROJECT_STATUS_KEYS: Record<string, string> = {
  backlog: "newProject.statusBacklog",
  planned: "newProject.statusPlanned",
  in_progress: "newProject.statusInProgress",
  completed: "newProject.statusCompleted",
  cancelled: "newProject.statusCancelled",
};
const projectStatusValues = ["backlog", "planned", "in_progress", "completed", "cancelled"] as const;

type WorkspaceSetup = "none" | "local" | "repo" | "both";
const REPO_ONLY_CWD_SENTINEL = "/__paperclip_repo_only__";

export function NewProjectDialog() {
  const { t } = useTranslation();
  const { newProjectOpen, closeNewProject } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [workspaceSetup, setWorkspaceSetup] = useState<WorkspaceSetup>("none");
  const [workspaceLocalPath, setWorkspaceLocalPath] = useState("");
  const [workspaceRepoUrl, setWorkspaceRepoUrl] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newProjectOpen,
  });

  const createProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.create(selectedCompanyId!, data),
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, "projects/drafts");
    },
  });

  function reset() {
    setName("");
    setDescription("");
    setStatus("planned");
    setGoalIds([]);
    setTargetDate("");
    setExpanded(false);
    setWorkspaceSetup("none");
    setWorkspaceLocalPath("");
    setWorkspaceRepoUrl("");
    setWorkspaceError(null);
  }

  const isAbsolutePath = (value: string) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);

  const isGitHubRepoUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (host !== "github.com" && host !== "www.github.com") return false;
      const segments = parsed.pathname.split("/").filter(Boolean);
      return segments.length >= 2;
    } catch {
      return false;
    }
  };

  const deriveWorkspaceNameFromPath = (value: string) => {
    const normalized = value.trim().replace(/[\\/]+$/, "");
    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? t("newProject.localFolderFallback");
  };

  const deriveWorkspaceNameFromRepo = (value: string) => {
    try {
      const parsed = new URL(value);
      const segments = parsed.pathname.split("/").filter(Boolean);
      const repo = segments[segments.length - 1]?.replace(/\.git$/i, "") ?? "";
      return repo || t("newProject.githubRepoFallback");
    } catch {
      return t("newProject.githubRepoFallback");
    }
  };

  const toggleWorkspaceSetup = (next: WorkspaceSetup) => {
    setWorkspaceSetup((prev) => (prev === next ? "none" : next));
    setWorkspaceError(null);
  };

  async function handleSubmit() {
    if (!selectedCompanyId || !name.trim()) return;
    const localRequired = workspaceSetup === "local" || workspaceSetup === "both";
    const repoRequired = workspaceSetup === "repo" || workspaceSetup === "both";
    const localPath = workspaceLocalPath.trim();
    const repoUrl = workspaceRepoUrl.trim();

    if (localRequired && !isAbsolutePath(localPath)) {
      setWorkspaceError(t("newProject.localPathError"));
      return;
    }
    if (repoRequired && !isGitHubRepoUrl(repoUrl)) {
      setWorkspaceError(t("newProject.repoUrlError"));
      return;
    }

    setWorkspaceError(null);

    try {
      const created = await createProject.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
        ...(goalIds.length > 0 ? { goalIds } : {}),
        ...(targetDate ? { targetDate } : {}),
      });

      const workspacePayloads: Array<Record<string, unknown>> = [];
      if (localRequired && repoRequired) {
        workspacePayloads.push({
          name: deriveWorkspaceNameFromPath(localPath),
          cwd: localPath,
          repoUrl,
        });
      } else if (localRequired) {
        workspacePayloads.push({
          name: deriveWorkspaceNameFromPath(localPath),
          cwd: localPath,
        });
      } else if (repoRequired) {
        workspacePayloads.push({
          name: deriveWorkspaceNameFromRepo(repoUrl),
          cwd: REPO_ONLY_CWD_SENTINEL,
          repoUrl,
        });
      }
      for (const workspacePayload of workspacePayloads) {
        await projectsApi.createWorkspace(created.id, {
          ...workspacePayload,
        });
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(selectedCompanyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(created.id) });
      reset();
      closeNewProject();
    } catch {
      // surface through createProject.isError
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const selectedGoals = (goals ?? []).filter((g) => goalIds.includes(g.id));
  const availableGoals = (goals ?? []).filter((g) => !goalIds.includes(g.id));

  return (
    <Dialog
      open={newProjectOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeNewProject();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={["ui-form-dialog-content", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="ui-form-dialog-header">
          <div className="ui-form-dialog-header-left">
            {selectedCompany && (
              <span className="ui-form-dialog-header-company">
                {selectedCompany.name.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="ui-form-dialog-header-sep">&rsaquo;</span>
            <span>{t("newProject.title")}</span>
          </div>
          <div className="ui-form-dialog-header-actions">
            <Button variant="ghost" size="icon-xs" onClick={() => setExpanded(!expanded)}>
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => { reset(); closeNewProject(); }}>
              <span className="ui-form-dialog-close-char">&times;</span>
            </Button>
          </div>
        </div>

        {/* Name */}
        <div className="ui-form-dialog-title-wrap">
          <input
            className="ui-form-dialog-title-input"
            placeholder={t("newProject.projectNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                descriptionEditorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="ui-form-dialog-body">
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder={t("newProject.addDescriptionPlaceholder")}
            bordered={false}
            contentClassName={["ui-form-dialog-content-editor", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        <div className="ui-form-dialog-workspace-section">
          <div className="ui-form-dialog-workspace-heading">
            <p className="ui-form-dialog-workspace-title">{t("newProject.whereWorkDone")}</p>
            <p className="ui-form-dialog-workspace-hint">{t("newProject.whereWorkDoneHint")}</p>
          </div>
          <div className="ui-form-dialog-workspace-grid">
            <button
              type="button"
              className={["ui-form-dialog-workspace-card", workspaceSetup === "local" ? "selected" : ""].filter(Boolean).join(" ")}
              onClick={() => toggleWorkspaceSetup("local")}
            >
              <div className="ui-form-dialog-workspace-card-inner">
                <FolderOpen />
                {t("newProject.localFolder")}
              </div>
              <p className="ui-form-dialog-workspace-card-desc">{t("newProject.localFolderHint")}</p>
            </button>
            <button
              type="button"
              className={["ui-form-dialog-workspace-card", workspaceSetup === "repo" ? "selected" : ""].filter(Boolean).join(" ")}
              onClick={() => toggleWorkspaceSetup("repo")}
            >
              <div className="ui-form-dialog-workspace-card-inner">
                <Github />
                {t("newProject.githubRepo")}
              </div>
              <p className="ui-form-dialog-workspace-card-desc">{t("newProject.githubRepoHint")}</p>
            </button>
            <button
              type="button"
              className={["ui-form-dialog-workspace-card", workspaceSetup === "both" ? "selected" : ""].filter(Boolean).join(" ")}
              onClick={() => toggleWorkspaceSetup("both")}
            >
              <div className="ui-form-dialog-workspace-card-inner">
                <GitBranch />
                {t("newProject.both")}
              </div>
              <p className="ui-form-dialog-workspace-card-desc">{t("newProject.bothHint")}</p>
            </button>
          </div>

          {(workspaceSetup === "local" || workspaceSetup === "both") && (
            <div className="ui-form-dialog-workspace-field">
              <label>{t("newProject.localFolderLabel")}</label>
              <div className="ui-form-dialog-workspace-field-row">
                <input
                  value={workspaceLocalPath}
                  onChange={(e) => setWorkspaceLocalPath(e.target.value)}
                  placeholder={t("newProject.localFolderPlaceholder")}
                />
                <ChoosePathButton />
              </div>
            </div>
          )}
          {(workspaceSetup === "repo" || workspaceSetup === "both") && (
            <div className="ui-form-dialog-workspace-field">
              <label>{t("newProject.githubRepoUrlLabel")}</label>
              <input
                value={workspaceRepoUrl}
                onChange={(e) => setWorkspaceRepoUrl(e.target.value)}
                placeholder={t("newProject.githubRepoUrlPlaceholder")}
              />
            </div>
          )}
          {workspaceError && (
            <p className="ui-form-dialog-workspace-error">{workspaceError}</p>
          )}
        </div>

        {/* Property chips */}
        <div className="ui-form-dialog-chips">
          {/* Status */}
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <StatusBadge status={status} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-40" align="start">
              {projectStatusValues.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={["ui-form-dialog-popover-item", s === status ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setStatus(s); setStatusOpen(false); }}
                >
                  {t(PROJECT_STATUS_KEYS[s])}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {selectedGoals.map((goal) => (
            <span key={goal.id} className="ui-form-dialog-goal-chip">
              <Target className="ui-form-dialog-chip-icon" />
              <span>{goal.title}</span>
              <button
                type="button"
                className="ui-form-dialog-goal-chip-remove"
                onClick={() => setGoalIds((prev) => prev.filter((id) => id !== goal.id))}
                aria-label={t("newProject.removeGoalAria", { title: goal.title })}
              >
                <X />
              </button>
            </span>
          ))}

          <Popover open={goalOpen} onOpenChange={setGoalOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="ui-form-dialog-chip"
                disabled={selectedGoals.length > 0 && availableGoals.length === 0}
              >
                {selectedGoals.length > 0 ? <Plus className="ui-form-dialog-chip-icon" /> : <Target className="ui-form-dialog-chip-icon" />}
                {selectedGoals.length > 0 ? t("newProject.addGoal") : t("newProject.goal")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-56" align="start">
              {selectedGoals.length === 0 && (
                <button
                  type="button"
                  className="ui-form-dialog-popover-item ui-form-dialog-popover-item-muted"
                  onClick={() => setGoalOpen(false)}
                >
                  {t("newProject.noGoal")}
                </button>
              )}
              {availableGoals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="ui-form-dialog-popover-item truncate"
                  onClick={() => {
                    setGoalIds((prev) => [...prev, g.id]);
                    setGoalOpen(false);
                  }}
                >
                  {g.title}
                </button>
              ))}
              {selectedGoals.length > 0 && availableGoals.length === 0 && (
                <div className="ui-form-dialog-popover-hint">
                  {t("newProject.allGoalsSelected")}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Target date */}
          <div className="ui-form-dialog-chip">
            <Calendar className="ui-form-dialog-chip-icon" />
            <input
              type="date"
              className="ui-form-dialog-date-input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              placeholder={t("newProject.targetDatePlaceholder")}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="ui-form-dialog-footer ui-form-dialog-footer-between">
          {createProject.isError ? (
            <p className="ui-form-dialog-footer-error">{t("newProject.createFailed")}</p>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            disabled={!name.trim() || createProject.isPending}
            onClick={handleSubmit}
          >
            {createProject.isPending ? t("newProject.creating") : t("newProject.createProject")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
