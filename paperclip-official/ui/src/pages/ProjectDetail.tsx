import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation, Navigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS, isUuidLike } from "@paperclipai/shared";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { assetsApi } from "../api/assets";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EMPTY_ISSUE_LIST } from "../lib/emptyCollections";
import { ProjectProperties, type ProjectConfigFieldKey, type ProjectFieldSaveState } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { StatusBadge } from "../components/StatusBadge";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { IconSettingDialog } from "../components/IconSettingDialog";
import { projectRouteRef } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { Trash2 } from "lucide-react";
import "./ProjectDetail.css";

/* ── Top-level tab types ── */

type ProjectTab = "overview" | "list" | "configuration";

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "configuration") return "configuration";
  if (tab === "issues") return "list";
  return null;
}

/* ── Overview tab content ── */

function OverviewContent({
  project,
  onUpdate,
  imageUploadHandler,
}: {
  project: { description: string | null; status: string; targetDate: string | null };
  onUpdate: (data: Record<string, unknown>) => void;
  imageUploadHandler?: (file: File) => Promise<string>;
}) {
  const { t } = useTranslation("project");
  return (
    <div className="project-detail-overview">
      <InlineEditor
        value={project.description ?? ""}
        onSave={(description) => onUpdate({ description })}
        as="p"
        className="project-detail-overview-desc"
        placeholder={t("addDescriptionPlaceholder")}
        multiline
        imageUploadHandler={imageUploadHandler}
      />

      <div className="project-detail-overview-grid">
        <div>
          <span className="project-detail-overview-label">{t("status")}</span>
          <div className="project-detail-overview-value">
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.targetDate && (
          <div>
            <span className="project-detail-overview-label">{t("targetDate")}</span>
            <p className="project-detail-overview-value">{project.targetDate}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const { t } = useTranslation("project");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="project-detail-color-picker-wrap" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="project-detail-color-trigger"
        style={{ backgroundColor: currentColor }}
        aria-label={t("changeProjectColor")}
      />
      {open && (
        <div className="project-detail-color-popover">
          <div className="project-detail-color-grid">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`project-detail-color-swatch ${color === currentColor ? "selected" : ""}`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List (issues) tab content ── */

function ProjectIssuesList({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  const removeIssue = useMutation({
    mutationFn: (id: string) => issuesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? EMPTY_ISSUE_LIST}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`paperclip:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutateAsync({ id, data })}
      onRemoveIssue={(id) => removeIssue.mutateAsync(id)}
    />
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ProjectConfigFieldKey, ProjectFieldSaveState>>>({});
  const [showIconDialog, setShowIconDialog] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);
  const fieldSaveRequestIds = useRef<Partial<Record<ProjectConfigFieldKey, number>>>({});
  const fieldSaveTimers = useRef<Partial<Record<ProjectConfigFieldKey, ReturnType<typeof setTimeout>>>>({});
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));

  const activeTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const archiveProjectMutation = useMutation({
    mutationFn: () =>
      projectsApi.update(
        projectLookupRef,
        { archivedAt: new Date().toISOString() },
        resolvedCompanyId ?? lookupCompanyId,
      ),
    onSuccess: () => {
      setDeleteProjectDialogOpen(false);
      setDeleteProjectError(null);
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
      }
      invalidateProject();
      navigate("/projects", { replace: true });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteProjectError(message);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsApi.remove(projectLookupRef, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: () => {
      setDeleteProjectDialogOpen(false);
      setDeleteProjectError(null);
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
      }
      invalidateProject();
      navigate("/projects", { replace: true });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setDeleteProjectError(message);
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
  });

  const { t } = useTranslation(["nav", "project", "common"]);
  const deleteProjectBusy = archiveProjectMutation.isPending || deleteProjectMutation.isPending;
  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav:projects"), href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? t("project:project") },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef, t]);

  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (activeTab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`, { replace: true });
      return;
    }
    if (activeTab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`, { replace: true });
      return;
    }
    if (activeTab === "list") {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, [closePanel]);

  useEffect(() => {
    return () => {
      Object.values(fieldSaveTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setFieldState = useCallback((field: ProjectConfigFieldKey, state: ProjectFieldSaveState) => {
    setFieldSaveStates((current) => ({ ...current, [field]: state }));
  }, []);

  const scheduleFieldReset = useCallback((field: ProjectConfigFieldKey, delayMs: number) => {
    const existing = fieldSaveTimers.current[field];
    if (existing) clearTimeout(existing);
    fieldSaveTimers.current[field] = setTimeout(() => {
      setFieldSaveStates((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      delete fieldSaveTimers.current[field];
    }, delayMs);
  }, []);

  const updateProjectField = useCallback(async (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    const requestId = (fieldSaveRequestIds.current[field] ?? 0) + 1;
    fieldSaveRequestIds.current[field] = requestId;
    setFieldState(field, "saving");
    try {
      await projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId);
      invalidateProject();
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "saved");
      scheduleFieldReset(field, 1800);
    } catch (error) {
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "error");
      scheduleFieldReset(field, 3000);
      throw error;
    }
  }, [invalidateProject, lookupCompanyId, projectLookupRef, resolvedCompanyId, scheduleFieldReset, setFieldState]);

  // Redirect bare /projects/:id to /projects/:id/issues
  if (routeProjectRef && activeTab === null) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="project-detail-error">{error.message}</p>;
  if (!project) return null;

  const handleTabChange = (tab: ProjectTab) => {
    if (tab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`);
    } else if (tab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`);
    } else {
      navigate(`/projects/${canonicalProjectRef}/issues`);
    }
  };

  return (
    <div className="project-detail-page">
      <div className="project-detail-header">
        <button
          type="button"
          onClick={() => setShowIconDialog(true)}
          className="project-detail-icon-btn"
          aria-label={t("project:iconSettingTitle")}
        >
          {project.iconContentPath ? (
            <img src={project.iconContentPath} alt="" />
          ) : (
            <div
              style={{ width: "100%", height: "100%", backgroundColor: project.color ?? "#6366f1" }}
            />
          )}
        </button>
        <div className="project-detail-title-wrap">
          <InlineEditor
            value={project.name}
            onSave={(name) => updateProject.mutate({ name })}
            as="h2"
            className="project-detail-title-inline"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="project-detail-delete-btn"
          disabled={deleteProjectBusy}
          aria-label={t("project:deleteProjectAria")}
          onClick={() => {
            setDeleteProjectError(null);
            setDeleteProjectDialogOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Dialog
        open={deleteProjectDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteProjectDialogOpen(false);
            setDeleteProjectError(null);
          }
        }}
      >
        <DialogContent className="dialog-max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("project:deleteProjectTitle")}</DialogTitle>
            <DialogDescription>{t("project:deleteProjectDescription", { name: project.name })}</DialogDescription>
          </DialogHeader>

          {deleteProjectError && <p className="text-xs text-destructive">{deleteProjectError}</p>}

          <DialogFooter className="project-detail-delete-dialog-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteProjectDialogOpen(false)}
              disabled={deleteProjectBusy}
            >
              {t("common:cancel")}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => archiveProjectMutation.mutate()}
              disabled={deleteProjectBusy}
            >
              {archiveProjectMutation.isPending
                ? t("common:loading")
                : t("project:deleteProjectRemoveFromListOption")}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteProjectMutation.mutate()}
              disabled={deleteProjectBusy}
            >
              {deleteProjectMutation.isPending
                ? t("common:loading")
                : t("project:deleteProjectDeleteWithFolderOption")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IconSettingDialog
        open={showIconDialog}
        onOpenChange={setShowIconDialog}
        mode="project"
        companyId={resolvedCompanyId!}
        currentIconUrl={project.iconContentPath ?? null}
        currentColor={project.color ?? null}
        onSaveIcon={async (assetId) => {
          await updateProject.mutateAsync({ iconAssetId: assetId });
        }}
        onSaveColor={async (color) => {
          await updateProject.mutateAsync({ color });
        }}
        busy={updateProject.isPending}
      />

      <Tabs value={activeTab ?? "list"} onValueChange={(value) => handleTabChange(value as ProjectTab)}>
        <PageTabBar
          items={[
            { value: "overview", label: t("project:overview") },
            { value: "list", label: t("project:list") },
            { value: "configuration", label: t("project:configuration") },
          ]}
          align="start"
          value={activeTab ?? "list"}
          onValueChange={(value) => handleTabChange(value as ProjectTab)}
        />
      </Tabs>

      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          onUpdate={(data) => updateProject.mutate(data)}
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      )}

      {activeTab === "list" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} />
      )}

      {activeTab === "configuration" && (
        <div className="project-detail-config-wrap">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
            onFieldUpdate={updateProjectField}
            getFieldSaveState={(field) => fieldSaveStates[field] ?? "idle"}
            onOpenIconSetting={() => setShowIconDialog(true)}
          />
        </div>
      )}
    </div>
  );
}
