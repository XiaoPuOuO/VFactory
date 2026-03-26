import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { companySkillsApi, type ImportCompanySkillsRequest } from "../api/companySkills";
import {
  buildCompanySkillMarkdownFromForm,
  createDefaultCompanySkillForm,
  createEmptyArgumentRow,
  parseCompanySkillMarkdownToFormOrAdvanced,
  validateSkillMarkdown,
  type CompanySkillArgumentFormRow,
  type CompanySkillFormState,
} from "../lib/companySkillForm";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookText, Plus, Pencil, Trash2 } from "lucide-react";
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

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("upsert");
  const [jsonText, setJsonText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editorSkillKey, setEditorSkillKey] = useState<string | null>(null);
  const [editorForm, setEditorForm] = useState<CompanySkillFormState>(() => createDefaultCompanySkillForm());
  const [editorAdvanced, setEditorAdvanced] = useState(false);
  const [editorRawMarkdown, setEditorRawMarkdown] = useState("");
  const [editorAdvancedHintKey, setEditorAdvancedHintKey] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTargetKey, setDeleteTargetKey] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("common:companies"), href: "/issues" },
      { label: t("nav:skills") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  useEffect(() => {
    if (!importDialogOpen) return;
    setImportError(null);
    setJsonText((prev) => (prev.trim().length > 0 ? prev : t("companySkills:jsonPlaceholder")));
  }, [importDialogOpen, t]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? "__none__"),
    queryFn: () => companySkillsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
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
        .map((s: any) => {
          if (!s || typeof s !== "object") return null;
          const skillMarkdown = (s as any).skillMarkdown;
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
    onSuccess: () => {
      setImportDialogOpen(false);
      setImportError(null);
      setJsonText("");
      queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setImportError(err instanceof Error ? err.message : "Import failed");
    },
  });

  const editorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");

      let skillMarkdown: string;
      try {
        skillMarkdown = editorAdvanced
          ? editorRawMarkdown
          : buildCompanySkillMarkdownFromForm(editorForm);
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : "Invalid skill form");
      }

      if (skillMarkdown.trim().length === 0) {
        throw new Error("Skill content is empty");
      }

      const validated = validateSkillMarkdown(skillMarkdown);
      if (!validated.ok) {
        throw new Error(validated.message);
      }

      if (editorMode === "create") {
        return companySkillsApi.create(selectedCompanyId, { skillMarkdown });
      }
      if (editorMode === "edit" && editorSkillKey) {
        return companySkillsApi.update(selectedCompanyId, editorSkillKey, { skillMarkdown });
      }
      throw new Error("Missing editor context");
    },
    onSuccess: () => {
      setEditorOpen(false);
      setEditorSkillKey(null);
      setEditorForm(createDefaultCompanySkillForm());
      setEditorAdvanced(false);
      setEditorRawMarkdown("");
      setEditorAdvancedHintKey(null);
      setEditorError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setEditorError(err instanceof Error ? err.message : "Save failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      if (!deleteTargetKey) throw new Error("Missing delete target");
      return companySkillsApi.remove(selectedCompanyId, deleteTargetKey);
    },
    onSuccess: () => {
      setDeleteOpen(false);
      setDeleteTargetKey(null);
      setDeleteTargetName(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    },
  });

  const exportLatest = async () => {
    if (!selectedCompanyId) return;
    const bundle = await companySkillsApi.exportLatest(selectedCompanyId);
    downloadJsonFile("company-skills.v0.json", bundle);
  };

  const emptyIcon = useMemo(() => BookText, []);

  const openCreateEditor = () => {
    setEditorMode("create");
    setEditorSkillKey(null);
    setEditorError(null);
    setEditorAdvanced(false);
    setEditorRawMarkdown("");
    setEditorAdvancedHintKey(null);
    setEditorForm(createDefaultCompanySkillForm());
    setEditorOpen(true);
  };

  const openEditEditor = (skill: { key: string; skillMarkdown: string }) => {
    setEditorMode("edit");
    setEditorSkillKey(skill.key);
    setEditorError(null);
    const parsed = parseCompanySkillMarkdownToFormOrAdvanced(skill.skillMarkdown);
    if (parsed.mode === "form") {
      setEditorAdvanced(false);
      setEditorRawMarkdown("");
      setEditorAdvancedHintKey(null);
      setEditorForm(parsed.form);
    } else {
      setEditorAdvanced(true);
      setEditorRawMarkdown(parsed.rawMarkdown);
      setEditorAdvancedHintKey(parsed.hint ?? "advancedUnknown");
      setEditorForm(createDefaultCompanySkillForm());
    }
    setEditorOpen(true);
  };

  const switchToAdvancedFromForm = () => {
    setEditorError(null);
    try {
      const md = buildCompanySkillMarkdownFromForm(editorForm);
      setEditorRawMarkdown(md);
      setEditorAdvanced(true);
      setEditorAdvancedHintKey(null);
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e));
    }
  };

  const switchToFormFromAdvanced = () => {
    setEditorError(null);
    const parsed = parseCompanySkillMarkdownToFormOrAdvanced(editorRawMarkdown);
    if (parsed.mode === "form") {
      setEditorForm(parsed.form);
      setEditorAdvanced(false);
      setEditorAdvancedHintKey(null);
      return;
    }
    setEditorError(t("companySkills:cannotSwitchToForm"));
  };

  const updateArgumentRow = (id: string, patch: Partial<CompanySkillArgumentFormRow>) => {
    setEditorForm((prev) => ({
      ...prev,
      arguments: prev.arguments.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  const removeArgumentRow = (id: string) => {
    setEditorForm((prev) => ({
      ...prev,
      arguments: prev.arguments.filter((row) => row.id !== id),
    }));
  };

  const addArgumentRow = () => {
    setEditorForm((prev) => ({
      ...prev,
      arguments: [...prev.arguments, createEmptyArgumentRow()],
    }));
  };

  const saveCompanySkill = () => {
    setEditorError(null);
    if (!editorAdvanced) {
      if (!editorForm.name.trim()) {
        setEditorError(t("companySkills:error_nameRequired"));
        return;
      }
      if (!editorForm.description.trim()) {
        setEditorError(t("companySkills:error_descriptionRequired"));
        return;
      }
      if (!editorForm.prompt.trim()) {
        setEditorError(t("companySkills:error_promptRequired"));
        return;
      }
    } else if (!editorRawMarkdown.trim()) {
      setEditorError(t("companySkills:error_markdownEmpty"));
      return;
    }
    editorMutation.mutate();
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
            <h2 className="company-skills-title">{t("companySkills:listTitle")}</h2>
            <div className="company-skills-actions">
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
                  <th>{t("companySkills:mode")}</th>
                  <th className="company-skills-desc-col">{t("companySkills:description")}</th>
                  <th className="company-skills-actions-col">{t("companySkills:actions")}</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => (
                  <tr key={s.key}>
                    <td className="company-skills-name">{s.name}</td>
                    <td>{s.mode}</td>
                    <td className="company-skills-desc company-skills-desc-col">{s.description}</td>
                    <td className="company-skills-actions-cell">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditEditor({ key: s.key, skillMarkdown: s.skillMarkdown })}
                      >
                        <Pencil className="company-skills-action-icon" />
                        {t("common:edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteTargetKey(s.key);
                          setDeleteTargetName(s.name);
                          setDeleteError(null);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="company-skills-action-icon" />
                      </Button>
                    </td>
                  </tr>
                ))}
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

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="company-skills-editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editorMode === "create" ? t("companySkills:createSkillTitle") : t("companySkills:editSkillTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="company-skills-editor-scroll">
            {editorAdvanced ? (
              <div className="company-skills-editor-form">
                {editorAdvancedHintKey && (
                  <div className="company-skills-advanced-banner" role="status">
                    {t(`companySkills:advancedHint_${editorAdvancedHintKey}`)}
                  </div>
                )}
                <div className="company-skills-field-label">{t("companySkills:skillMarkdownLabel")}</div>
                <Textarea
                  className="company-skills-textarea company-skills-textarea-tall"
                  value={editorRawMarkdown}
                  onChange={(e) => setEditorRawMarkdown(e.target.value)}
                  spellCheck={false}
                />
                <div className="company-skills-advanced-actions">
                  <Button type="button" variant="outline" size="sm" onClick={switchToFormFromAdvanced}>
                    {t("companySkills:backToVisualForm")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="company-skills-editor-form">
                <div className="company-skills-form-grid-2">
                  <div className="company-skills-field-block">
                    <Label htmlFor="cs-name">{t("companySkills:field_name")}</Label>
                    <Input
                      id="cs-name"
                      className="company-skills-input"
                      value={editorForm.name}
                      onChange={(e) => setEditorForm((p) => ({ ...p, name: e.target.value }))}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {editorMode === "edit" && (
                      <p className="company-skills-field-hint">{t("companySkills:editNameHint")}</p>
                    )}
                  </div>
                  <div className="company-skills-field-block">
                    <div className="company-skills-field-label">{t("companySkills:field_mode")}</div>
                    <Select
                      value={editorForm.mode}
                      onValueChange={(v) =>
                        setEditorForm((p) => ({ ...p, mode: v as CompanySkillFormState["mode"] }))
                      }
                    >
                      <SelectTrigger className="company-skills-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passive">{t("companySkills:mode_passive")}</SelectItem>
                        <SelectItem value="active">{t("companySkills:mode_active")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="company-skills-field-block">
                  <Label htmlFor="cs-desc">{t("companySkills:field_description")}</Label>
                  <Textarea
                    id="cs-desc"
                    className="company-skills-textarea"
                    rows={2}
                    value={editorForm.description}
                    onChange={(e) => setEditorForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div className="company-skills-checkbox-row">
                  <Checkbox
                    id="cs-internal"
                    checked={editorForm.internal}
                    onCheckedChange={(v) => setEditorForm((p) => ({ ...p, internal: v === true }))}
                  />
                  <Label htmlFor="cs-internal" className="company-skills-checkbox-label">
                    {t("companySkills:field_internal")}
                  </Label>
                </div>

                <div className="company-skills-field-block">
                  <Label htmlFor="cs-prompt">{t("companySkills:field_prompt")}</Label>
                  <p className="company-skills-field-hint">{t("companySkills:field_promptHint")}</p>
                  <Textarea
                    id="cs-prompt"
                    className="company-skills-textarea"
                    rows={8}
                    value={editorForm.prompt}
                    onChange={(e) => setEditorForm((p) => ({ ...p, prompt: e.target.value }))}
                    spellCheck={false}
                  />
                </div>

                <div className="company-skills-field-block">
                  <Label htmlFor="cs-body">{t("companySkills:field_markdownBody")}</Label>
                  <p className="company-skills-field-hint">{t("companySkills:field_markdownBodyHint")}</p>
                  <Textarea
                    id="cs-body"
                    className="company-skills-textarea"
                    rows={4}
                    value={editorForm.markdownBody}
                    onChange={(e) => setEditorForm((p) => ({ ...p, markdownBody: e.target.value }))}
                  />
                </div>

                <div className="company-skills-args-section">
                  <div className="company-skills-args-header">
                    <span className="company-skills-field-label">{t("companySkills:argumentsSection")}</span>
                    <Button type="button" variant="outline" size="sm" onClick={addArgumentRow}>
                      <Plus className="company-skills-arg-add-icon" />
                      {t("companySkills:addArgument")}
                    </Button>
                  </div>
                  {editorForm.arguments.length === 0 ? (
                    <p className="company-skills-args-empty">{t("companySkills:argumentsEmpty")}</p>
                  ) : (
                    editorForm.arguments.map((row) => (
                      <div key={row.id} className="company-skills-arg-card">
                        <div className="company-skills-form-grid-3">
                          <div className="company-skills-field-block">
                            <Label>{t("companySkills:arg_name")}</Label>
                            <Input
                              className="company-skills-input"
                              value={row.name}
                              onChange={(e) => updateArgumentRow(row.id, { name: e.target.value })}
                              spellCheck={false}
                            />
                          </div>
                          <div className="company-skills-field-block">
                            <div className="company-skills-field-label">{t("companySkills:arg_type")}</div>
                            <Select
                              value={row.type}
                              onValueChange={(v) =>
                                updateArgumentRow(row.id, { type: v as CompanySkillArgumentFormRow["type"] })
                              }
                            >
                              <SelectTrigger className="company-skills-select">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">{t("companySkills:arg_type_string")}</SelectItem>
                                <SelectItem value="number">{t("companySkills:arg_type_number")}</SelectItem>
                                <SelectItem value="boolean">{t("companySkills:arg_type_boolean")}</SelectItem>
                                <SelectItem value="enum">{t("companySkills:arg_type_enum")}</SelectItem>
                                <SelectItem value="json">{t("companySkills:arg_type_json")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="company-skills-field-block company-skills-arg-actions">
                            <div className="company-skills-checkbox-row">
                              <Checkbox
                                id={`req-${row.id}`}
                                checked={row.required}
                                onCheckedChange={(v) => updateArgumentRow(row.id, { required: v === true })}
                              />
                              <Label htmlFor={`req-${row.id}`} className="company-skills-checkbox-label">
                                {t("companySkills:arg_required")}
                              </Label>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="company-skills-arg-remove"
                              onClick={() => removeArgumentRow(row.id)}
                            >
                              <Trash2 className="company-skills-action-icon" />
                            </Button>
                          </div>
                        </div>
                        <div className="company-skills-field-block">
                          <Label>{t("companySkills:arg_description")}</Label>
                          <Input
                            className="company-skills-input"
                            value={row.description}
                            onChange={(e) => updateArgumentRow(row.id, { description: e.target.value })}
                          />
                        </div>
                        {row.type === "enum" && (
                          <div className="company-skills-field-block">
                            <Label>{t("companySkills:arg_enumOptions")}</Label>
                            <Input
                              className="company-skills-input"
                              value={row.enumOptions}
                              onChange={(e) => updateArgumentRow(row.id, { enumOptions: e.target.value })}
                              placeholder={t("companySkills:arg_enumPlaceholder")}
                            />
                          </div>
                        )}
                        <div className="company-skills-field-block">
                          <Label>{t("companySkills:arg_default")}</Label>
                          <Input
                            className="company-skills-input"
                            value={row.defaultValue}
                            onChange={(e) => updateArgumentRow(row.id, { defaultValue: e.target.value })}
                            placeholder={t("companySkills:arg_defaultPlaceholder")}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="company-skills-advanced-actions">
                  <Button type="button" variant="outline" size="sm" onClick={switchToAdvancedFromForm}>
                    {t("companySkills:openAdvancedMarkdown")}
                  </Button>
                </div>
              </div>
            )}
            {editorError && <div className="company-skills-import-error">{editorError}</div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t("companySkills:cancel")}
            </Button>
            <Button onClick={saveCompanySkill} disabled={editorMutation.isPending}>
              {t("companySkills:saveSkill")}
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
