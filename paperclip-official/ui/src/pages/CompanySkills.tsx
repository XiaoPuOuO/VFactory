import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { companySkillsApi, type ImportCompanySkillsRequest } from "../api/companySkills";
import { getCompanySkillWorkflowMeta } from "../lib/workflowSkillMeta";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookText, Plus, Pencil, Trash2 } from "lucide-react";
import { useNavigate } from "@/lib/router";
import "./CompanySkills.css";

type ImportMode = ImportCompanySkillsRequest["mode"];

function downloadJsonFile(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export function CompanySkills() {
  const { t } = useTranslation(["companySkills", "nav", "common"]);
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("upsert");
  const [jsonText, setJsonText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /** 預設不顯示 `metadata.internal` 的流程；開啟後可管理／編輯 */
  const [showInternalWorkflows, setShowInternalWorkflows] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("common:companies"), href: "/issues" },
      { label: t("nav:skills"), href: "/company/workflows" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  useEffect(() => {
    if (!importDialogOpen) return;
    setImportError(null);
    setJsonText((prev) => (prev.trim().length > 0 ? prev : t("companySkills:jsonPlaceholder")));
  }, [importDialogOpen, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? "__none__", showInternalWorkflows),
    queryFn: () => companySkillsApi.list(selectedCompanyId!, { includeInternal: showInternalWorkflows }),
    enabled: !!selectedCompanyId,
    /**
     * 這個列表是使用者「新增/刪除後立刻回來看結果」的核心畫面。
     * 即便前一頁已 invalidate，仍可能因 staleTime 與導頁時序造成畫面短暫讀到舊快取。
     * 這裡改為每次 mount 都強制重抓，確保不需要手動 reload。
     */
    refetchOnMount: "always",
  });

  const skills = data?.skills ?? [];

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");

      if (jsonText.trim().length === 0) {
        throw new Error("JSON input is empty");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        throw new Error("Invalid JSON");
      }

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid JSON shape");
      }

      const record = parsed as { skills?: unknown };
      const rawSkills = Array.isArray(record.skills) ? record.skills : null;
      if (!rawSkills) throw new Error("Missing `skills` array");

      const skillsToSend = rawSkills
        .map((s: unknown) => {
          if (!s || typeof s !== "object") return null;
          const skillMarkdown = (s as { skillMarkdown?: unknown }).skillMarkdown;
          if (typeof skillMarkdown !== "string" || skillMarkdown.trim().length === 0) return null;
          return { skillMarkdown };
        })
        .filter((x): x is { skillMarkdown: string } => x != null);

      if (skillsToSend.length === 0) throw new Error("No valid skillMarkdown entries found");

      const body: ImportCompanySkillsRequest = {
        mode: importMode,
        skills: skillsToSend,
      };
      return companySkillsApi.importLatest(selectedCompanyId, body);
    },
    onSuccess: async () => {
      setImportDialogOpen(false);
      setImportError(null);
      setJsonText("");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companySkills.root(selectedCompanyId!),
        refetchType: "all",
      });
    },
    onError: (err) => {
      setImportError(err instanceof Error ? err.message : "Import failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (!deleteTargetKey) throw new Error("Missing delete target");
      return companySkillsApi.remove(selectedCompanyId, deleteTargetKey);
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      setDeleteTargetKey(null);
      setDeleteTargetName(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companySkills.root(selectedCompanyId!),
        refetchType: "all",
      });
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const exportLatest = async () => {
    if (!selectedCompanyId) return;
    const bundle = await companySkillsApi.exportLatest(selectedCompanyId);
    downloadJsonFile("company-workflows.v0.json", bundle);
  };

  const emptyIcon = useMemo(() => BookText, []);

  const openCreateEditor = () => {
    navigate("/company/workflows/new");
  };

  const openEditEditor = (skill: { key: string }) => {
    navigate(`/company/workflows/${encodeURIComponent(skill.key)}/edit`);
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={emptyIcon} message={t("companySkills:selectCompanyToView")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (error) {
    return <div className="company-skills-page">{t("common:error")}</div>;
  }

  return (
    <div className="company-skills-page">
      {skills.length === 0 ? (
        <div className="company-skills-empty-wrap">
          <EmptyState
            icon={emptyIcon}
            message={t("companySkills:noSkillsYet")}
            action={t("companySkills:newSkillButton")}
            onAction={openCreateEditor}
          />
          <div className="company-skills-empty-import-action">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              {t("companySkills:importButton")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="company-skills-header">
            <div className="company-skills-header-titles">
              <h2 className="company-skills-title">{t("companySkills:listTitle")}</h2>
              <p className="company-skills-subtitle">{t("companySkills:listSubtitle")}</p>
            </div>
            <div className="company-skills-actions">
              <label className="company-skills-show-internal">
                <Checkbox
                  checked={showInternalWorkflows}
                  onCheckedChange={(v) => setShowInternalWorkflows(v === true)}
                />
                <span>{t("companySkills:showInternalWorkflows")}</span>
              </label>
              <Button variant="outline" onClick={exportLatest}>
                {t("companySkills:exportButton")}
              </Button>
              <Button onClick={openCreateEditor}>
                <Plus className="company-skills-new-skill-icon" />
                {t("companySkills:newSkillButton")}
              </Button>
              <Button onClick={() => setImportDialogOpen(true)}>{t("companySkills:importButton")}</Button>
            </div>
          </div>

          <div className="company-skills-table-wrap" role="region" aria-label={t("companySkills:listTitle")}>
            <table className="company-skills-table">
              <thead>
                <tr>
                  <th>{t("companySkills:name")}</th>
                  <th>{t("companySkills:triggerColumn")}</th>
                  <th className="company-skills-actions-col">{t("companySkills:actions")}</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => {
                  const wfMeta = getCompanySkillWorkflowMeta(s.skillMarkdown);
                  const triggerKey =
                    wfMeta.triggerLabel === "manual" ||
                    wfMeta.triggerLabel === "schedule" ||
                    wfMeta.triggerLabel === "event"
                      ? wfMeta.triggerLabel
                      : "manual";
                  const executionLabel =
                    s.mode === "passive" ? t("companySkills:listExecution_auto") : t("companySkills:listExecution_manual");
                  return (
                    <tr key={s.key}>
                      <td className="company-skills-name-cell">
                        <span className="company-skills-name-row">
                          <span className="company-skills-name">{s.name}</span>
                          {s.internal === true && (
                            <span className="company-skills-internal-badge">{t("companySkills:listInternalBadge")}</span>
                          )}
                        </span>
                        <span className="company-skills-name-preview">{s.description}</span>
                      </td>
                      <td className="company-skills-trigger-cell">
                        <span className="company-skills-execution-badge">{executionLabel}</span>
                        {wfMeta.isWorkflow ? (
                          <div className="company-skills-workflow-cell">
                            <span className="company-skills-workflow-meta">
                              {t("companySkills:workflowSteps", { count: wfMeta.stepCount })}{" "}
                              · {t(`companySkills:workflowTrigger_${triggerKey}`)}
                            </span>
                          </div>
                        ) : (
                          <span className="company-skills-workflow-dash">—</span>
                        )}
                      </td>
                      <td className="company-skills-actions-cell">
                        <Button variant="outline" size="sm" onClick={() => openEditEditor({ key: s.key })}>
                          <Pencil className="company-skills-action-icon" />
                          {t("common:edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="company-skills-delete-btn"
                          onClick={() => {
                            setDeleteTargetKey(s.key);
                            setDeleteTargetName(s.name);
                            setDeleteError(null);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="company-skills-action-icon" />
                          {t("companySkills:deleteButton")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="company-skills-import-dialog">
          <DialogHeader>
            <DialogTitle>{t("companySkills:importTitle")}</DialogTitle>
          </DialogHeader>

          <div className="company-skills-import-form">
            <div className="company-skills-import-mode-row">
              <div className="company-skills-field-label">{t("companySkills:importModeLabel")}</div>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                <SelectTrigger className="company-skills-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">{t("companySkills:importMode_upsert")}</SelectItem>
                  <SelectItem value="replace">{t("companySkills:importMode_replace")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="company-skills-field-label">{t("companySkills:jsonInputLabel")}</div>
            <Textarea
              className="company-skills-textarea"
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
            />

            {importError && <div className="company-skills-import-error">{importError}</div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t("companySkills:cancel")}
            </Button>
            <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
              {t("companySkills:applyImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="company-skills-editor-dialog">
          <DialogHeader>
            <DialogTitle>{t("companySkills:deleteSkillTitle")}</DialogTitle>
          </DialogHeader>

          <div className="company-skills-delete-text">
            {t("companySkills:deleteConfirm", { name: deleteTargetName ?? "" })}
          </div>
          {deleteError && <div className="company-skills-import-error">{deleteError}</div>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("companySkills:cancel")}
            </Button>
            <Button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {t("companySkills:confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
