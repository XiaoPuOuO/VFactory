import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";
import { useWorkflowUnsavedRegistration } from "@/context/WorkflowUnsavedContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { companySkillsApi } from "../api/companySkills";
import { useNavigate } from "@/lib/router";
import {
  buildCompanySkillMarkdownFromForm,
  companySkillArgumentRowsToDefinitions,
  createDefaultCompanySkillForm,
  createEmptyArgumentRow,
  parseCompanySkillMarkdownToFormOrAdvanced,
  skillArgumentDefinitionsToFormRows,
  validateSkillMarkdown,
  type CompanySkillArgumentFormRow,
  type CompanySkillFormState,
} from "../lib/companySkillForm";
import {
  createInitialActiveFlowSkillMarkdown,
  getFlowFromFrontmatter,
  mergeArgumentsIntoSkillMarkdown,
  mergeBasicFrontmatterIntoSkillMarkdown,
} from "../lib/skillMarkdownFlow";
import { getWorkflowTemplates, type WorkflowTemplateDef } from "../lib/workflowTemplates";
import { WorkflowFlowEditor } from "../components/WorkflowFlowEditor";
import { TemplateVariableInserter, useTextareaVariableInsert } from "../components/TemplateVariableInserter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { SkillFrontmatter, SkillMode } from "@paperclipai/shared";
import { safeParseSkillFrontmatterFromMarkdownForFlowEditor } from "@paperclipai/shared";
import "./CompanySkills.css";
import "./CompanyWorkflowEdit.css";

type EditorMode = "create" | "edit";

/** Apple 風格開關（僅此頁 workflow 表單使用） */
function AppleWorkflowSwitch({
  checked,
  onCheckedChange,
  id,
  "aria-labelledby": ariaLabelledby,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-labelledby={ariaLabelledby}
      className="company-workflow-switch"
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="company-workflow-switch-track" aria-hidden>
        <span className="company-workflow-switch-thumb" />
      </span>
    </button>
  );
}

function WorkflowModeToggleRow({
  value,
  onChange,
}: {
  value: SkillMode;
  onChange: (mode: SkillMode) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  const isActive = value === "active";
  return (
    <div className="company-workflow-toggle-field company-workflow-toggle-field--inline">
      <div className="company-workflow-toggle-field-text">
        <div className="company-workflow-form-field-label" id={labelId}>
          {t("companySkills:field_mode")}
        </div>
        <p className="company-workflow-toggle-hint" id={`${labelId}-hint`}>
          {isActive ? t("companySkills:workflowForm_modeHint_active") : t("companySkills:workflowForm_modeHint_passive")}
        </p>
      </div>
      <div className="company-workflow-mode-switch-wrap" aria-describedby={`${labelId}-hint`}>
        <span className={`company-workflow-mode-pill ${!isActive ? "is-selected" : ""}`} aria-hidden>
          {t("companySkills:mode_segment_passive")}
        </span>
        <AppleWorkflowSwitch
          checked={isActive}
          onCheckedChange={(on) => onChange(on ? "active" : "passive")}
          aria-labelledby={labelId}
        />
        <span className={`company-workflow-mode-pill ${isActive ? "is-selected" : ""}`} aria-hidden>
          {t("companySkills:mode_segment_active")}
        </span>
      </div>
    </div>
  );
}

/** 指令參數表單（簡單模式與流程編輯器模式共用）。 */
function WorkflowArgumentsFields({
  rows,
  updateArgumentRow,
  removeArgumentRow,
  addArgumentRow,
}: {
  rows: CompanySkillArgumentFormRow[];
  updateArgumentRow: (id: string, patch: Partial<CompanySkillArgumentFormRow>) => void;
  removeArgumentRow: (id: string) => void;
  addArgumentRow: () => void;
}) {
  const { t } = useTranslation(["companySkills"]);
  return (
    <div className="company-skills-args-section">
      <div className="company-skills-args-header">
        <span className="company-skills-field-label">{t("companySkills:argumentsSection")}</span>
        <Button type="button" variant="outline" size="sm" onClick={addArgumentRow}>
          <Plus className="company-skills-arg-add-icon" />
          {t("companySkills:addArgument")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="company-skills-args-empty">{t("companySkills:argumentsEmpty")}</p>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="company-skills-arg-card">
            <div className="company-skills-form-grid-4">
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
                <Label>{t("companySkills:arg_label")}</Label>
                <Input
                  className="company-skills-input"
                  value={row.label}
                  onChange={(e) => updateArgumentRow(row.id, { label: e.target.value })}
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
                    id={`wf-req-${row.id}`}
                    checked={row.required}
                    onCheckedChange={(v) => updateArgumentRow(row.id, { required: v === true })}
                  />
                  <Label htmlFor={`wf-req-${row.id}`} className="company-skills-checkbox-label">
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
  );
}

function WorkflowInternalToggleRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const labelId = useId();
  return (
    <div className="company-workflow-toggle-field company-workflow-toggle-field--inline">
      <span className="company-workflow-toggle-inline-label" id={labelId}>
        {t("companySkills:field_internal")}
      </span>
      <AppleWorkflowSwitch
        checked={checked}
        onCheckedChange={onChange}
        aria-labelledby={labelId}
      />
    </div>
  );
}

function CompanyWorkflowEditorShell({ mode, skillKey }: { mode: EditorMode; skillKey?: string }) {
  const { t } = useTranslation(["companySkills", "nav", "common"]);
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workflowUnsaved = useWorkflowUnsavedRegistration();

  const [wizardDone, setWizardDone] = useState(mode === "edit");
  const [editorMode, setEditorMode] = useState<EditorMode>(mode);
  const [editorSkillKey, setEditorSkillKey] = useState<string | null>(skillKey ?? null);
  const [editorForm, setEditorForm] = useState<CompanySkillFormState>(() => createDefaultCompanySkillForm());
  const [editorAdvanced, setEditorAdvanced] = useState(false);
  const [editorRawMarkdown, setEditorRawMarkdown] = useState("");
  const [editorAdvancedHintKey, setEditorAdvancedHintKey] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const ignoreDirty = useRef(true);
  /**
   * 精靈第一步選擇（行為規範 vs 作業流程）。用於套用範本時保留使用者選的「執行方式」，
   * 避免範本內建的 mode（多為 passive）覆寫掉「作業流程」應對應的 active。
   */
  const [wizardSkillKind, setWizardSkillKind] = useState<"behavior" | "process" | null>(null);

  const promptInsert = useTextareaVariableInsert(editorForm.prompt, (next) =>
    setEditorForm((p) => ({ ...p, prompt: next })),
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companySkills.list(selectedCompanyId ?? "__none__", true),
    queryFn: () => companySkillsApi.list(selectedCompanyId!, { includeInternal: true }),
    enabled: !!selectedCompanyId && mode === "edit" && !!skillKey,
  });

  const skillRecord = useMemo(
    () => data?.skills.find((s) => s.key === skillKey),
    [data?.skills, skillKey],
  );

  const advancedFrontmatter = useMemo(() => {
    if (!editorAdvanced) return null;
    const parsed = safeParseSkillFrontmatterFromMarkdownForFlowEditor(editorRawMarkdown);
    return parsed.success ? (parsed.data as SkillFrontmatter) : null;
  }, [editorAdvanced, editorRawMarkdown]);

  const advancedBasicHasFlow = useMemo(() => {
    if (!advancedFrontmatter) return false;
    const flow = getFlowFromFrontmatter(advancedFrontmatter);
    return flow.length > 0;
  }, [advancedFrontmatter]);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("common:companies"), href: "/issues" },
      { label: t("nav.skills"), href: "/company/workflows" },
      { label: mode === "create" ? t("companySkills:newSkillButton") : skillRecord?.name ?? "…" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t, mode, skillRecord?.name]);

  const loadEdit = useCallback((skill: { key: string; skillMarkdown: string }) => {
    ignoreDirty.current = true;
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
      const fmParsed = safeParseSkillFrontmatterFromMarkdownForFlowEditor(parsed.rawMarkdown);
      if (fmParsed.success) {
        setEditorForm({
          ...createDefaultCompanySkillForm(),
          arguments: skillArgumentDefinitionsToFormRows(fmParsed.data.arguments),
        });
      } else {
        setEditorForm(createDefaultCompanySkillForm());
      }
    }
    setDirty(false);
    requestAnimationFrame(() => {
      ignoreDirty.current = false;
    });
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !skillKey || !skillRecord) return;
    loadEdit({ key: skillRecord.key, skillMarkdown: skillRecord.skillMarkdown });
  }, [mode, skillKey, skillRecord?.key, skillRecord?.skillMarkdown, loadEdit]);

  useEffect(() => {
    if (mode !== "create") return;
    ignoreDirty.current = true;
    setEditorMode("create");
    setEditorSkillKey(null);
    setEditorError(null);
    setEditorAdvanced(false);
    setEditorRawMarkdown("");
    setEditorAdvancedHintKey(null);
    setEditorForm(createDefaultCompanySkillForm());
    setWizardSkillKind(null);
    setDirty(false);
    requestAnimationFrame(() => {
      ignoreDirty.current = false;
    });
  }, [mode]);

  const advancedHasFlow = useMemo(() => {
    if (!editorAdvanced) return false;
    const p = safeParseSkillFrontmatterFromMarkdownForFlowEditor(editorRawMarkdown);
    if (!p.success) return false;
    return getFlowFromFrontmatter(p.data as SkillFrontmatter).length > 0;
  }, [editorAdvanced, editorRawMarkdown]);

  useEffect(() => {
    if (ignoreDirty.current) return;
    setDirty(true);
  }, [editorAdvanced, editorRawMarkdown, editorForm]);

  useEffect(() => {
    workflowUnsaved?.setDirty(dirty);
    return () => workflowUnsaved?.setDirty(false);
  }, [dirty, workflowUnsaved]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const editorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");

      let skillMarkdown: string;
      try {
        skillMarkdown = editorAdvanced ? editorRawMarkdown : buildCompanySkillMarkdownFromForm(editorForm);
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
    onSuccess: async () => {
      setDirty(false);
      workflowUnsaved?.setDirty(false);
      ignoreDirty.current = true;
      /**
       * 預設 invalidate 只會 refetch「active」查詢；從列表進入全頁編輯時列表 observer 已卸載，
       * 工作流程列表查詢為 inactive，不會立即重抓。refetchType: "all" 一併刷新快取中的列表，
       * 避免返回 /company/workflows 仍顯示舊資料。
       */
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companySkills.root(selectedCompanyId!),
        refetchType: "all",
      });
      // 針對列表頁實際使用的兩種 queryKey 再明確 refetch，避免任何快取狀態/時序差導致未更新。
      await queryClient.refetchQueries({
        queryKey: queryKeys.companySkills.list(selectedCompanyId!, false),
        type: "all",
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.companySkills.list(selectedCompanyId!, true),
        type: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workflowRuns.list(selectedCompanyId!),
        refetchType: "all",
      });
      navigate("/company/workflows");
    },
    onError: (err) => {
      setEditorError(err instanceof Error ? err.message : "Save failed");
    },
  });

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
    setEditorForm((prev) => {
      const nextArguments = prev.arguments.map((row) => (row.id === id ? { ...row, ...patch } : row));
      if (editorAdvanced) {
        const defs = companySkillArgumentRowsToDefinitions(nextArguments);
        setEditorRawMarkdown((raw) => mergeArgumentsIntoSkillMarkdown(raw, defs));
      }
      return { ...prev, arguments: nextArguments };
    });
  };

  const removeArgumentRow = (id: string) => {
    setEditorForm((prev) => {
      const nextArguments = prev.arguments.filter((row) => row.id !== id);
      if (editorAdvanced) {
        const defs = companySkillArgumentRowsToDefinitions(nextArguments);
        setEditorRawMarkdown((raw) => mergeArgumentsIntoSkillMarkdown(raw, defs));
      }
      return { ...prev, arguments: nextArguments };
    });
  };

  const addArgumentRow = () => {
    setEditorForm((prev) => {
      const nextArguments = [...prev.arguments, createEmptyArgumentRow()];
      if (editorAdvanced) {
        const defs = companySkillArgumentRowsToDefinitions(nextArguments);
        setEditorRawMarkdown((raw) => mergeArgumentsIntoSkillMarkdown(raw, defs));
      }
      return { ...prev, arguments: nextArguments };
    });
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

  const cancelEdit = () => {
    navigate("/company/workflows");
  };

  const applyTemplate = (tpl: WorkflowTemplateDef) => {
    ignoreDirty.current = true;
    const parsed = parseCompanySkillMarkdownToFormOrAdvanced(tpl.markdown);
    const modeFromWizard: SkillMode | undefined =
      wizardSkillKind === "process" ? "active" : wizardSkillKind === "behavior" ? "passive" : undefined;

    if (parsed.mode === "form") {
      setEditorForm({
        ...parsed.form,
        ...(modeFromWizard ? { mode: modeFromWizard } : {}),
      });
      setEditorAdvanced(false);
      setEditorRawMarkdown("");
      setEditorAdvancedHintKey(null);
    } else {
      let raw = parsed.rawMarkdown;
      if (modeFromWizard) {
        raw = mergeBasicFrontmatterIntoSkillMarkdown(raw, { mode: modeFromWizard });
      }
      setEditorAdvanced(true);
      setEditorRawMarkdown(raw);
      setEditorAdvancedHintKey(parsed.hint ?? null);
      const fmParsed = safeParseSkillFrontmatterFromMarkdownForFlowEditor(raw);
      if (fmParsed.success) {
        setEditorForm({
          ...createDefaultCompanySkillForm(),
          ...(modeFromWizard ? { mode: modeFromWizard } : {}),
          arguments: skillArgumentDefinitionsToFormRows(fmParsed.data.arguments),
        });
      } else {
        setEditorForm(createDefaultCompanySkillForm());
      }
    }
    setWizardDone(true);
    setDirty(true);
    requestAnimationFrame(() => {
      ignoreDirty.current = false;
    });
  };

  const selectWizardKind = (kind: "behavior" | "process") => {
    setWizardSkillKind(kind);
    if (kind === "process") {
      setEditorAdvanced(true);
      setEditorRawMarkdown(
        createInitialActiveFlowSkillMarkdown({
          name: "my-skill",
          description: t("companySkills:initialWorkflowDescription"),
          firstStepName: t("companySkills:initialFlowStepName"),
          firstStepTemplate: t("companySkills:initialFlowStepTemplate"),
        }),
      );
      setEditorAdvancedHintKey(null);
      setEditorForm({ ...createDefaultCompanySkillForm(), mode: "active" });
    } else {
      setEditorAdvanced(false);
      setEditorRawMarkdown("");
      setEditorAdvancedHintKey(null);
      setEditorForm((p) => ({ ...p, mode: "passive" }));
    }
    setWizardDone(true);
  };

  const argNamesForInsert = useMemo(
    () => editorForm.arguments.map((a) => a.name).filter((n) => n.trim().length > 0),
    [editorForm.arguments],
  );

  if (!selectedCompanyId) {
    return <div className="company-workflow-edit-page">{t("companySkills:selectCompanyToView")}</div>;
  }

  if (mode === "edit" && skillKey && isLoading) {
    return <div className="company-workflow-edit-page">{t("common:loading")}</div>;
  }

  if (mode === "edit" && skillKey && !isLoading && !skillRecord) {
    return <div className="company-workflow-edit-page">{t("common:error")}</div>;
  }

  if (mode === "create" && !wizardDone) {
    const templates = getWorkflowTemplates();
    return (
      <div className="company-workflow-edit-page company-workflow-wizard">
        <Button type="button" variant="ghost" className="company-workflow-wizard-back" onClick={() => navigate("/company/workflows")}>
          <ArrowLeft className="company-workflow-wizard-back-icon" />
          {t("companySkills:backToList")}
        </Button>
        <h1 className="company-workflow-wizard-title">{t("companySkills:workflowWizardTitle")}</h1>
        <div className="company-workflow-wizard-cards" dir="ltr">
          <button
            type="button"
            className="company-workflow-wizard-card"
            onClick={() => selectWizardKind("behavior")}
          >
            <span className="company-workflow-wizard-card-title">{t("companySkills:wizardBehaviorTitle")}</span>
            <p className="company-workflow-wizard-card-desc">{t("companySkills:wizardBehaviorDesc")}</p>
          </button>
          <button
            type="button"
            className="company-workflow-wizard-card"
            onClick={() => selectWizardKind("process")}
          >
            <span className="company-workflow-wizard-card-title">{t("companySkills:wizardProcessTitle")}</span>
            <p className="company-workflow-wizard-card-desc">{t("companySkills:wizardProcessDesc")}</p>
          </button>
        </div>
        <div className="company-workflow-wizard-templates">
          <div className="company-workflow-wizard-templates-label">{t("companySkills:wizardChooseTemplate")}</div>
          <div className="company-workflow-wizard-template-row">
            {templates.map((tpl) => (
              <Button key={tpl.id} type="button" variant="outline" size="sm" onClick={() => applyTemplate(tpl)}>
                {t(`companySkills:template_${tpl.id}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pageTitle =
    editorMode === "create" ? t("companySkills:createSkillTitle") : t("companySkills:editSkillTitle");

  return (
    <div className="company-workflow-edit-page">
      <header className="company-workflow-edit-header">
        <div className="company-workflow-edit-header-main">
          <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} className="company-workflow-edit-back">
            <ArrowLeft className="company-workflow-edit-back-icon" />
            {t("companySkills:backToList")}
          </Button>
          <div>
            <h1 className="company-workflow-edit-title">{pageTitle}</h1>
            <p className="company-workflow-edit-subtitle">
              {editorMode === "create" ? t("companySkills:editorSubtitleCreate") : t("companySkills:editorSubtitleEdit")}
            </p>
          </div>
        </div>
        <div className="company-workflow-edit-header-actions">
          <Button type="button" variant="outline" onClick={cancelEdit}>
            {t("companySkills:cancel")}
          </Button>
          <Button type="button" onClick={saveCompanySkill} disabled={editorMutation.isPending}>
            {t("companySkills:saveSkill")}
          </Button>
        </div>
      </header>

      <div className="company-workflow-edit-body">
        {editorAdvanced ? (
          <div className="company-skills-editor-form company-workflow-edit-form-wide">
            {editorAdvancedHintKey &&
              !["flowUsesFlowEditor", "flowNotSupportedInForm"].includes(editorAdvancedHintKey) && (
                <div className="company-skills-advanced-banner" role="status">
                  {t(`companySkills:advancedHint_${editorAdvancedHintKey}`)}
                </div>
              )}
            {/* 多步驟 flow 仍需提供基本表單欄位（名稱/描述/模式/內部標記） */}
            {advancedBasicHasFlow && advancedFrontmatter && (
              <div className="company-workflow-edit-advanced-basic">
                <div className="company-workflow-form-stack">
                  <section className="company-workflow-form-panel" aria-labelledby="wf-adv-section-combined">
                    <h2 className="company-workflow-form-panel-title" id="wf-adv-section-combined">
                      {t("companySkills:workflowForm_section_combined")}
                    </h2>
                    <div className="company-skills-field-block">
                      <Label htmlFor="wf-adv-name">{t("companySkills:field_name")}</Label>
                      <Input
                        id="wf-adv-name"
                        className="company-skills-input"
                        value={advancedFrontmatter.name ?? ""}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          setEditorRawMarkdown((prev) =>
                            mergeBasicFrontmatterIntoSkillMarkdown(prev, { name: nextName }),
                          );
                          setDirty(true);
                          workflowUnsaved?.setDirty(true);
                        }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>

                    <div className="company-skills-field-block">
                      <Label htmlFor="wf-adv-desc">{t("companySkills:field_description")}</Label>
                      <Textarea
                        id="wf-adv-desc"
                        className="company-skills-textarea"
                        rows={2}
                        value={advancedFrontmatter.description ?? ""}
                        onChange={(e) => {
                          const nextDesc = e.target.value;
                          setEditorRawMarkdown((prev) =>
                            mergeBasicFrontmatterIntoSkillMarkdown(prev, { description: nextDesc }),
                          );
                          setDirty(true);
                          workflowUnsaved?.setDirty(true);
                        }}
                      />
                    </div>

                    <WorkflowModeToggleRow
                      value={advancedFrontmatter.mode === "active" ? "active" : "passive"}
                      onChange={(nextMode) => {
                        setEditorRawMarkdown((prev) =>
                          mergeBasicFrontmatterIntoSkillMarkdown(prev, { mode: nextMode }),
                        );
                        setDirty(true);
                        workflowUnsaved?.setDirty(true);
                      }}
                    />

                    <WorkflowInternalToggleRow
                      checked={advancedFrontmatter.metadata?.internal === true}
                      onChange={(v) => {
                        setEditorRawMarkdown((prev) =>
                          mergeBasicFrontmatterIntoSkillMarkdown(prev, { internal: v }),
                        );
                        setDirty(true);
                        workflowUnsaved?.setDirty(true);
                      }}
                    />
                  </section>
                </div>
              </div>
            )}
            {advancedHasFlow && (
              <div className="company-workflow-edit-advanced-args">
                <div className="company-workflow-form-stack">
                  <section className="company-workflow-form-panel" aria-labelledby="wf-adv-args">
                    <h2 className="company-workflow-form-panel-title" id="wf-adv-args">
                      {t("companySkills:workflowForm_section_arguments")}
                    </h2>
                    <p className="company-skills-field-hint company-workflow-args-hint">
                      {t("companySkills:workflowForm_argumentsHint")}
                    </p>
                    <WorkflowArgumentsFields
                      rows={editorForm.arguments}
                      updateArgumentRow={updateArgumentRow}
                      removeArgumentRow={removeArgumentRow}
                      addArgumentRow={addArgumentRow}
                    />
                  </section>
                </div>
              </div>
            )}
            <div className="company-workflow-edit-flow-wrap">
              <WorkflowFlowEditor
                markdown={editorRawMarkdown}
                onMarkdownChange={setEditorRawMarkdown}
                argumentNames={argNamesForInsert}
              />
            </div>
            {!advancedHasFlow && (
              <div className="company-skills-advanced-actions">
                <Button type="button" variant="outline" size="sm" onClick={switchToFormFromAdvanced}>
                  {t("companySkills:backToVisualForm")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="company-skills-editor-form company-workflow-edit-form-wide">
            <div className="company-workflow-form-stack">
              <section className="company-workflow-form-panel" aria-labelledby="wf-section-combined">
                <h2 className="company-workflow-form-panel-title" id="wf-section-combined">
                  {t("companySkills:workflowForm_section_combined")}
                </h2>
                <div className="company-skills-field-block">
                  <Label htmlFor="wf-name">{t("companySkills:field_name")}</Label>
                  <Input
                    id="wf-name"
                    className="company-skills-input"
                    value={editorForm.name}
                    onChange={(e) => setEditorForm((p) => ({ ...p, name: e.target.value }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {editorMode === "edit" && <p className="company-skills-field-hint">{t("companySkills:editNameHint")}</p>}
                </div>

                <div className="company-skills-field-block">
                  <Label htmlFor="wf-desc">{t("companySkills:field_description")}</Label>
                  <Textarea
                    id="wf-desc"
                    className="company-skills-textarea"
                    rows={2}
                    value={editorForm.description}
                    onChange={(e) => setEditorForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <WorkflowModeToggleRow
                  value={editorForm.mode}
                  onChange={(nextMode) => setEditorForm((p) => ({ ...p, mode: nextMode }))}
                />

                <WorkflowInternalToggleRow
                  checked={editorForm.internal}
                  onChange={(v) => setEditorForm((p) => ({ ...p, internal: v }))}
                />
              </section>

              <section className="company-workflow-form-panel" aria-labelledby="wf-section-instructions">
                <h2 className="company-workflow-form-panel-title" id="wf-section-instructions">
                  {t("companySkills:workflowForm_section_instructions")}
                </h2>
            <div className="company-skills-field-block">
              <div className="company-workflow-prompt-label-row">
                <Label htmlFor="wf-prompt">{t("companySkills:field_prompt")}</Label>
                <TemplateVariableInserter
                  insertToken={promptInsert.insertToken}
                  argumentNames={argNamesForInsert}
                  priorOutputs={[]}
                />
              </div>
              <p className="company-skills-field-hint">{t("companySkills:field_promptHint")}</p>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="company-workflow-vars-trigger">
                    {t("companySkills:field_promptVariablesTitle")}
                    <ChevronDown className="company-workflow-vars-chevron" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="company-skills-field-hint company-workflow-vars-body">{t("companySkills:field_promptVariablesBody")}</p>
                </CollapsibleContent>
              </Collapsible>
              <Textarea
                id="wf-prompt"
                ref={promptInsert.textareaRef}
                onSelect={promptInsert.captureSelection}
                className="company-skills-textarea"
                rows={8}
                value={editorForm.prompt}
                onChange={(e) => setEditorForm((p) => ({ ...p, prompt: e.target.value }))}
                spellCheck={false}
              />
            </div>

            <div className="company-skills-field-block">
              <Label htmlFor="wf-body">{t("companySkills:field_markdownBody")}</Label>
              <p className="company-skills-field-hint" title={t("companySkills:field_markdownBodyHint")}>
                {t("companySkills:field_markdownBodyHint")}
              </p>
              <Textarea
                id="wf-body"
                className="company-skills-textarea"
                rows={4}
                value={editorForm.markdownBody}
                onChange={(e) => setEditorForm((p) => ({ ...p, markdownBody: e.target.value }))}
              />
            </div>

            <WorkflowArgumentsFields
              rows={editorForm.arguments}
              updateArgumentRow={updateArgumentRow}
              removeArgumentRow={removeArgumentRow}
              addArgumentRow={addArgumentRow}
            />

              </section>
            </div>
          </div>
        )}
        {editorError && <div className="company-skills-import-error">{editorError}</div>}
      </div>
    </div>
  );
}

export function CompanyWorkflowNewPage() {
  return <CompanyWorkflowEditorShell mode="create" />;
}

export function CompanyWorkflowEditPage() {
  const { skillKey } = useParams<{ skillKey: string }>();
  return <CompanyWorkflowEditorShell mode="edit" skillKey={skillKey} />;
}
