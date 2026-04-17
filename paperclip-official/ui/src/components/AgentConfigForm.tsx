import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import {
  adapterRequiresApiKeyInput,
  API_KEY_ENV_BY_ADAPTER,
  validateApiKeyFormat,
} from "../lib/api-key-validation";
import type {
  Agent,
  AdapterEnvironmentTestResult,
  CompanySecret,
  EnvBinding,
} from "@paperclipai/shared";
import type { AdapterModel } from "../api/agents";
import { agentsApi } from "../api/agents";
import { secretsApi } from "../api/secrets";
import { assetsApi } from "../api/assets";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, FolderOpen, Heart, ChevronDown, X } from "lucide-react";
import { cn } from "../lib/utils";
import { extractModelName, extractProviderId } from "../lib/model-utils";
import { queryKeys } from "../lib/queryKeys";
import { useCompany } from "../context/CompanyContext";
import {
  Field,
  ToggleField,
  ToggleWithNumber,
  CollapsibleSection,
  DraftInput,
  DraftNumberInput,
  adapterLabels,
  roleLabels,
} from "./agent-config-primitives";
import { defaultCreateValues } from "./agent-config-defaults";
import { getUIAdapter } from "../adapters";
import { ClaudeLocalAdvancedFields } from "../adapters/claude-local/config-fields";
import { MarkdownEditor } from "./MarkdownEditor";
import { ChoosePathButton } from "./PathInstructionsModal";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import { meApi } from "../api/me";
import { companiesApi } from "../api/companies";

/* ---- Create mode values ---- */

// Canonical type lives in @paperclipai/adapter-utils; re-exported here
// so existing imports from this file keep working.
export type { CreateConfigValues } from "@paperclipai/adapter-utils";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";

/* ---- Props ---- */

type AgentConfigFormProps = {
  adapterModels?: AdapterModel[];
  onDirtyChange?: (dirty: boolean) => void;
  onSaveActionChange?: (save: (() => void) | null) => void;
  onCancelActionChange?: (cancel: (() => void) | null) => void;
  hideInlineSave?: boolean;
  /** "cards" renders each section as heading + bordered card (for settings pages). Default: "inline" (border-b dividers). */
  sectionLayout?: "inline" | "cards";
} & (
  | {
      mode: "create";
      values: CreateConfigValues;
      onChange: (patch: Partial<CreateConfigValues>) => void;
    }
  | {
      mode: "edit";
      agent: Agent;
      onSave: (patch: Record<string, unknown>) => void;
      isSaving?: boolean;
    }
);

/* ---- Edit mode overlay (dirty tracking) ---- */

interface Overlay {
  identity: Record<string, unknown>;
  adapterType?: string;
  adapterConfig: Record<string, unknown>;
  heartbeat: Record<string, unknown>;
  runtime: Record<string, unknown>;
}

const emptyOverlay: Overlay = {
  identity: {},
  adapterConfig: {},
  heartbeat: {},
  runtime: {},
};

/** Stable empty object used as fallback for missing env config to avoid new-object-per-render. */
const EMPTY_ENV: Record<string, EnvBinding> = {};

function isOverlayDirty(o: Overlay): boolean {
  return (
    Object.keys(o.identity).length > 0 ||
    o.adapterType !== undefined ||
    Object.keys(o.adapterConfig).length > 0 ||
    Object.keys(o.heartbeat).length > 0 ||
    Object.keys(o.runtime).length > 0
  );
}

/* ---- Shared input class ---- */
const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

/** 直屬主管選單顯示字串（排序與搜尋用 value 需一致）。 */
function buildReportsToManagerLabel(
  a: Agent,
  roleLabelMap: Record<string, string>,
  inactiveHint: string,
): string {
  return `${a.name}${a.status === "terminated" ? ` (${inactiveHint})` : ""}${a.title ? ` — ${a.title}` : ""} (${roleLabelMap[a.role] ?? a.role})`;
}

function parseCommaArgs(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatArgList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }
  return typeof value === "string" ? value : "";
}

const codexThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

const openCodeThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "minimal", label: "Minimal" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "max", label: "Max" },
] as const;

const cursorModeOptions = [
  { id: "", label: "Auto" },
  { id: "plan", label: "Plan" },
  { id: "ask", label: "Ask" },
] as const;

const claudeThinkingEffortOptions = [
  { id: "", label: "Auto" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;


/* ---- Form ---- */

export function AgentConfigForm(props: AgentConfigFormProps) {
  const { t } = useTranslation(["agents", "common"]);
  const { mode, adapterModels: externalModels } = props;
  const isCreate = mode === "create";
  const cards = props.sectionLayout === "cards";
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const { data: meProfile } = useQuery({ queryKey: ["me"], queryFn: () => meApi.get(), retry: false });
  const canSetWorkingDirectory = meProfile?.group === "admin";

  const { data: allowedAdapterData } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.companies.allowedAdapterTypes(selectedCompanyId) : ["companies", "none", "allowed-adapter-types"],
    queryFn: () => companiesApi.allowedAdapterTypes(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const allowedAdapterTypes = allowedAdapterData?.adapterTypes;
  /** 具備全部 model.* 權限時不限制選單；否則僅顯示有權限的 adapter 類型 */
  const canUseAllAdapters = (allowedAdapterTypes?.length ?? 0) >= 10;

  const { data: availableSecrets = [] } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.secrets.list(selectedCompanyId) : ["secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const { data: companyAgents = [] } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(!isCreate && selectedCompanyId),
  });

  const reportsToManagerChoices = useMemo(() => {
    if (props.mode !== "edit") return [];
    const selfId = props.agent.id;
    const currentReportsTo = props.agent.reportsTo;
    const inactiveHint = t("agents:reportsToInactiveHint");
    const pickable = companyAgents.filter(
      (a) => a.id !== selfId && a.status !== "terminated",
    );
    const list = [...pickable];
    if (
      currentReportsTo &&
      !list.some((a) => a.id === currentReportsTo)
    ) {
      const stillListed = companyAgents.find((a) => a.id === currentReportsTo);
      if (stillListed) list.push(stillListed);
    }
    list.sort((a, b) =>
      buildReportsToManagerLabel(a, roleLabels, inactiveHint).localeCompare(
        buildReportsToManagerLabel(b, roleLabels, inactiveHint),
        undefined,
        { sensitivity: "base" },
      ),
    );
    return list;
  }, [
    props.mode,
    companyAgents,
    props.mode === "edit" ? props.agent.id : "",
    props.mode === "edit" ? props.agent.reportsTo : null,
    t,
  ]);

  const createSecret = useMutation({
    mutationFn: (input: { name: string; value: string }) => {
      if (!selectedCompanyId) throw new Error("Select a company to create secrets");
      return secretsApi.create(selectedCompanyId, input);
    },
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    },
  });

  const uploadMarkdownImage = useMutation({
    mutationFn: async ({ file, namespace }: { file: File; namespace: string }) => {
      if (!selectedCompanyId) throw new Error("Select a company to upload images");
      return assetsApi.uploadImage(selectedCompanyId, file, namespace);
    },
  });

  // ---- Edit mode: overlay for dirty tracking ----
  const [overlay, setOverlay] = useState<Overlay>(emptyOverlay);
  const [reportsToPickerOpen, setReportsToPickerOpen] = useState(false);
  const agentRef = useRef<Agent | null>(null);

  // Clear overlay when agent data refreshes (after save)
  useEffect(() => {
    if (!isCreate) {
      if (agentRef.current !== null && props.agent !== agentRef.current) {
        setOverlay({ ...emptyOverlay });
      }
      agentRef.current = props.agent;
    }
  }, [isCreate, !isCreate ? props.agent : undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = !isCreate && isOverlayDirty(overlay);

  /** Read effective value: overlay if dirty, else original */
  function eff<T>(group: keyof Omit<Overlay, "adapterType">, field: string, original: T): T {
    const o = overlay[group];
    if (field in o) return o[field] as T;
    return original;
  }

  /** Mark field dirty in overlay */
  function mark(group: keyof Omit<Overlay, "adapterType">, field: string, value: unknown) {
    setOverlay((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  }

  /** Build accumulated patch and send to parent */
  const handleCancel = useCallback(() => {
    setOverlay({ ...emptyOverlay });
  }, []);

  const handleSave = useCallback(() => {
    if (isCreate || !isDirty) return;
    const agent = props.agent;
    const patch: Record<string, unknown> = {};

    if (Object.keys(overlay.identity).length > 0) {
      Object.assign(patch, overlay.identity);
    }
    if (overlay.adapterType !== undefined) {
      patch.adapterType = overlay.adapterType;
      // When adapter type changes, send only the new config — don't merge
      // with old config since old adapter fields are meaningless for the new type
      patch.adapterConfig = overlay.adapterConfig;
    } else if (Object.keys(overlay.adapterConfig).length > 0) {
      const existing = (agent.adapterConfig ?? {}) as Record<string, unknown>;
      patch.adapterConfig = { ...existing, ...overlay.adapterConfig };
    }
    if (Object.keys(overlay.heartbeat).length > 0) {
      const existingRc = (agent.runtimeConfig ?? {}) as Record<string, unknown>;
      const existingHb = (existingRc.heartbeat ?? {}) as Record<string, unknown>;
      patch.runtimeConfig = { ...existingRc, heartbeat: { ...existingHb, ...overlay.heartbeat } };
    }
    if (Object.keys(overlay.runtime).length > 0) {
      Object.assign(patch, overlay.runtime);
    }

    props.onSave(patch);
  }, [isCreate, isDirty, overlay, props]);

  useEffect(() => {
    if (!isCreate) {
      props.onDirtyChange?.(isDirty);
      props.onSaveActionChange?.(handleSave);
      props.onCancelActionChange?.(handleCancel);
    }
  }, [isCreate, isDirty, props.onDirtyChange, props.onSaveActionChange, props.onCancelActionChange, handleSave, handleCancel]);

  useEffect(() => {
    if (isCreate) return;
    return () => {
      props.onSaveActionChange?.(null);
      props.onCancelActionChange?.(null);
      props.onDirtyChange?.(false);
    };
  }, [isCreate, props.onDirtyChange, props.onSaveActionChange, props.onCancelActionChange]);

  // ---- Resolve values ----
  const config = !isCreate ? ((props.agent.adapterConfig ?? {}) as Record<string, unknown>) : {};
  const runtimeConfig = !isCreate ? ((props.agent.runtimeConfig ?? {}) as Record<string, unknown>) : {};
  const heartbeat = !isCreate ? ((runtimeConfig.heartbeat ?? {}) as Record<string, unknown>) : {};

  const adapterType = isCreate
    ? props.values.adapterType
    : overlay.adapterType ?? props.agent.adapterType;
  const isLocal =
    adapterType === "claude_local" ||
    adapterType === "claude_remote" ||
    adapterType === "codex_local" ||
    adapterType === "codex_remote" ||
    adapterType === "gemini_local" ||
    adapterType === "gemini_remote" ||
    adapterType === "opencode_local" ||
    adapterType === "cursor";
  /** Self-hosted HTTP LLM: environment test + prompt/cwd like local CLIs, but no generic CLI command block. */
  const isLocalOrSelfHostedLlm = isLocal || adapterType === "local_self_hosted_llm";
  const uiAdapter = useMemo(() => getUIAdapter(adapterType), [adapterType]);

  // Fetch adapter models for the effective adapter type
  const {
    data: fetchedModels,
    error: fetchedModelsError,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.adapterModels(selectedCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(selectedCompanyId!, adapterType),
    enabled: Boolean(selectedCompanyId),
  });
  const models = fetchedModels ?? externalModels ?? [];

  /** Props passed to adapter-specific config field components */
  const adapterFieldProps = {
    mode,
    isCreate,
    adapterType,
    values: isCreate ? props.values : null,
    set: isCreate ? (patch: Partial<CreateConfigValues>) => props.onChange(patch) : null,
    config,
    eff: eff as <T>(group: "adapterConfig", field: string, original: T) => T,
    mark: mark as (group: "adapterConfig", field: string, value: unknown) => void,
    models,
  };

  // Section toggle state — advanced always starts collapsed
  const [runPolicyAdvancedOpen, setRunPolicyAdvancedOpen] = useState(false);
  // Popover states
  const [modelOpen, setModelOpen] = useState(false);
  const [thinkingEffortOpen, setThinkingEffortOpen] = useState(false);

  // Create mode helpers
  const val = isCreate ? props.values : null;
  const set = isCreate
    ? (patch: Partial<CreateConfigValues>) => props.onChange(patch)
    : null;

  function buildAdapterConfigForTest(): Record<string, unknown> {
    if (isCreate) {
      return uiAdapter.buildAdapterConfig(val!);
    }
    const base = config as Record<string, unknown>;
    return { ...base, ...overlay.adapterConfig };
  }

  const testEnvironment = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) {
        throw new Error("Select a company to test adapter environment");
      }
      return agentsApi.testEnvironment(selectedCompanyId, adapterType, {
        adapterConfig: buildAdapterConfigForTest(),
      });
    },
  });

  // Current model for display
  const currentModelId = isCreate
    ? val!.model
    : eff("adapterConfig", "model", String(config.model ?? ""));

  const thinkingEffortKey =
    adapterType === "codex_local" || adapterType === "codex_remote"
      ? "modelReasoningEffort"
      : adapterType === "cursor"
        ? "mode"
        : adapterType === "opencode_local"
          ? "variant"
          : "effort";
  const thinkingEffortOptions =
    adapterType === "codex_local" || adapterType === "codex_remote"
      ? codexThinkingEffortOptions
      : adapterType === "cursor"
        ? cursorModeOptions
        : adapterType === "opencode_local"
          ? openCodeThinkingEffortOptions
          : claudeThinkingEffortOptions;
  const currentThinkingEffort = isCreate
    ? val!.thinkingEffort
    : adapterType === "codex_local" || adapterType === "codex_remote"
      ? eff(
          "adapterConfig",
          "modelReasoningEffort",
          String(config.modelReasoningEffort ?? config.reasoningEffort ?? ""),
        )
      : adapterType === "cursor"
        ? eff("adapterConfig", "mode", String(config.mode ?? ""))
        : adapterType === "opencode_local"
          ? eff("adapterConfig", "variant", String(config.variant ?? ""))
          : eff("adapterConfig", "effort", String(config.effort ?? ""));
  const showThinkingEffort = adapterType !== "gemini_local" && adapterType !== "gemini_remote";
  const codexSearchEnabled = (adapterType === "codex_local" || adapterType === "codex_remote")
    ? (isCreate ? Boolean(val!.search) : eff("adapterConfig", "search", Boolean(config.search)))
    : false;

  return (
    <div className={cn("relative", cards && "space-y-6")}>
      {/* ---- Floating Save button (edit mode, when dirty) ---- */}
      {isDirty && !props.hideInlineSave && (
        <div className="ui-agent-form-save-bar">
          <div className="ui-agent-form-save-row">
            <span className="ui-agent-form-muted-xs">Unsaved changes</span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isCreate && props.isSaving}
            >
              {!isCreate && props.isSaving ? t("agents:saving") : t("agents:saveButton")}
            </Button>
          </div>
        </div>
      )}

      {/* ---- Identity (edit only) ---- */}
      {!isCreate && (
        <div className={cn(!cards && "border-b border-border")}>
          {cards
            ? <h3 className="ui-agent-form-section-title mb-3">{t("agents:identity")}</h3>
            : <div className="ui-agent-form-section-header-inline"><span className="ui-agent-form-section-title-inline">{t("agents:identity")}</span></div>
          }
          <div className={cn(cards ? "ui-agent-form-card" : "ui-agent-form-body")}>
            <Field label={t("agents:name")} hint={t("agents:helpName")}>
              <DraftInput
                value={eff("identity", "name", props.agent.name)}
                onCommit={(v) => mark("identity", "name", v)}
                immediate
                className={inputClass}
                placeholder={t("agents:agentNamePlaceholder")}
              />
            </Field>
            <Field label={t("agents:title")} hint={t("agents:helpTitle")}>
              <DraftInput
                value={eff("identity", "title", props.agent.title ?? "")}
                onCommit={(v) => mark("identity", "title", v || null)}
                immediate
                className={inputClass}
                placeholder={t("agents:titlePlaceholder")}
              />
            </Field>
            <Field label={t("agents:reportsToField")} hint={t("agents:helpReportsTo")}>
              {(() => {
                const inactiveHint = t("agents:reportsToInactiveHint");
                const effectiveReportsTo = eff("identity", "reportsTo", props.agent.reportsTo);
                const selectedId =
                  typeof effectiveReportsTo === "string" && effectiveReportsTo.length > 0
                    ? effectiveReportsTo
                    : null;
                const selectedAgent =
                  selectedId != null
                    ? reportsToManagerChoices.find((x) => x.id === selectedId) ??
                      companyAgents.find((x) => x.id === selectedId)
                    : null;
                const triggerLabel =
                  selectedId == null
                    ? t("agents:reportsToNone")
                    : selectedAgent
                      ? buildReportsToManagerLabel(selectedAgent, roleLabels, inactiveHint)
                      : selectedId.slice(0, 8);
                return (
                  <Popover open={reportsToPickerOpen} onOpenChange={setReportsToPickerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          inputClass,
                          "flex w-full cursor-pointer items-center justify-between gap-2 text-left font-sans",
                        )}
                        aria-expanded={reportsToPickerOpen}
                        aria-haspopup="listbox"
                        aria-label={t("agents:reportsToField")}
                      >
                        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
                        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-2rem,22rem)] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder={t("agents:reportsToSearchPlaceholder")} />
                        <CommandList>
                          <CommandEmpty>{t("agents:reportsToNoMatches")}</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value={`${t("agents:reportsToNone")} __root__`}
                              onSelect={() => {
                                mark("identity", "reportsTo", null);
                                setReportsToPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 size-4 shrink-0",
                                  selectedId == null ? "opacity-100" : "opacity-0",
                                )}
                                aria-hidden
                              />
                              {t("agents:reportsToNone")}
                            </CommandItem>
                            {reportsToManagerChoices.map((a) => {
                              const label = buildReportsToManagerLabel(a, roleLabels, inactiveHint);
                              return (
                                <CommandItem
                                  key={a.id}
                                  value={`${a.id} ${label}`}
                                  onSelect={() => {
                                    mark("identity", "reportsTo", a.id);
                                    setReportsToPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 size-4 shrink-0",
                                      selectedId === a.id ? "opacity-100" : "opacity-0",
                                    )}
                                    aria-hidden
                                  />
                                  <span className="truncate">{label}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              })()}
            </Field>
            <Field label={t("agents:capabilities")} hint={t("agents:helpCapabilities")}>
              <MarkdownEditor
                value={eff("identity", "capabilities", props.agent.capabilities ?? "")}
                onChange={(v) => mark("identity", "capabilities", v || null)}
                placeholder={t("agents:capabilitiesPlaceholder")}
                contentClassName="min-h-[44px] text-sm font-mono"
                imageUploadHandler={async (file) => {
                  const asset = await uploadMarkdownImage.mutateAsync({
                    file,
                    namespace: `agents/${props.agent.id}/capabilities`,
                  });
                  return asset.contentPath;
                }}
              />
            </Field>
            {isLocalOrSelfHostedLlm && (
              <Field label={t("agents:promptTemplate")} hint={t("agents:helpPromptTemplate")}>
                <MarkdownEditor
                  value={eff(
                    "adapterConfig",
                    "promptTemplate",
                    String(config.promptTemplate ?? ""),
                  )}
                  onChange={(v) => mark("adapterConfig", "promptTemplate", v ?? "")}
                  placeholder={t("agents:promptTemplatePlaceholder")}
                  contentClassName="min-h-[88px] text-sm font-mono"
                  imageUploadHandler={async (file) => {
                    const namespace = `agents/${props.agent.id}/prompt-template`;
                    const asset = await uploadMarkdownImage.mutateAsync({ file, namespace });
                    return asset.contentPath;
                  }}
                />
              </Field>
            )}
          </div>
        </div>
      )}

      {/* ---- Adapter ---- */}
      <div className={cn(!cards && (isCreate ? "border-t border-border" : "border-b border-border"))}>
        <div className={cn(cards ? "ui-agent-form-section-header-card" : "ui-agent-form-section-header-inline")}>
          {cards
            ? <h3 className="ui-agent-form-section-title">{t("agents:adapter")}</h3>
            : <span className="ui-agent-form-section-title-inline">{t("agents:adapter")}</span>
          }
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ui-agent-form-btn-sm"
            onClick={() => testEnvironment.mutate()}
            disabled={testEnvironment.isPending || !selectedCompanyId}
          >
            {testEnvironment.isPending
              ? t("common:testing")
              : adapterRequiresApiKeyInput(adapterType)
                ? t("common:testConnection")
                : t("common:testEnvironment")}
          </Button>
        </div>
        <div className={cn(cards ? "ui-agent-form-card" : "ui-agent-form-body")}>
          <Field label={t("agents:adapterType")} hint={t("agents:helpAdapterType")}>
            <AdapterTypeDropdown
              value={adapterType}
              allowedTypes={
                selectedCompanyId && allowedAdapterTypes !== undefined
                  ? allowedAdapterTypes
                  : undefined
              }
              onChange={(t) => {
                if (isCreate) {
                  // Reset all adapter-specific fields to defaults when switching adapter type
                  const { adapterType: _at, ...defaults } = defaultCreateValues;
                  const nextValues: CreateConfigValues = { ...defaults, adapterType: t };
                  if (t === "codex_local" || t === "codex_remote") {
                    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
                    nextValues.dangerouslyBypassSandbox =
                      DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
                  } else if (t === "gemini_local" || t === "gemini_remote") {
                    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
                  } else if (t === "cursor") {
                    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
                  } else if (t === "opencode_local") {
                    nextValues.model = "";
                  } else if (t === "local_self_hosted_llm") {
                    nextValues.baseUrl = "http://127.0.0.1:11434/v1";
                    nextValues.model = "";
                    nextValues.envBindings = { ...nextValues.envBindings };
                    delete nextValues.envBindings.apiKey;
                  }
                  set!(nextValues);
                } else {
                  // Clear all adapter config and explicitly blank out model + effort/mode keys
                  // so the old adapter's values don't bleed through via eff()
                  setOverlay((prev) => ({
                    ...prev,
                    adapterType: t,
                    adapterConfig: {
                      model:
                        t === "codex_local" || t === "codex_remote"
                          ? DEFAULT_CODEX_LOCAL_MODEL
                          : t === "gemini_local" || t === "gemini_remote"
                            ? DEFAULT_GEMINI_LOCAL_MODEL
                            : t === "cursor"
                              ? DEFAULT_CURSOR_LOCAL_MODEL
                              : "",
                      effort: "",
                      modelReasoningEffort: "",
                      variant: "",
                      mode: "",
                      ...(t === "codex_local" || t === "codex_remote"
                        ? {
                            dangerouslyBypassApprovalsAndSandbox:
                              DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
                          }
                        : {}),
                      ...(t === "local_self_hosted_llm"
                        ? { baseUrl: "http://127.0.0.1:11434/v1", apiKey: undefined }
                        : {}),
                    },
                  }));
                }
              }}
            />
          </Field>

          {testEnvironment.error && (
            <div className="ui-agent-form-error-box">
              {testEnvironment.error instanceof Error
                ? testEnvironment.error.message
                : t("agents:environmentTestFailed")}
            </div>
          )}

          {testEnvironment.data && (
            <AdapterEnvironmentResult result={testEnvironment.data} />
          )}

          {/* API Key (direct input when adapter requires it) */}
          {isLocal && adapterRequiresApiKeyInput(adapterType) && (() => {
            const keyName = API_KEY_ENV_BY_ADAPTER[adapterType];
            if (!keyName) return null;
            const envSource = (isCreate
              ? (val!.envBindings ?? {})
              : (config.env ?? {})) as Record<string, EnvBinding>;
            const binding = envSource[keyName];
            const plainValue =
              typeof binding === "string"
                ? binding
                : typeof binding === "object" && binding !== null && "type" in binding && (binding as { type: string }).type === "plain"
                  ? String((binding as { value?: unknown }).value ?? "")
                  : "";
            const apiKeyFormatError =
              !canUseAllAdapters && plainValue ? validateApiKeyFormat(adapterType, plainValue) : null;
            return (
              <Field
                label={t("agents:apiKey")}
                hint={
                  adapterType === "claude_remote"
                    ? "ANTHROPIC_API_KEY (starts with sk-ant-)"
                    : adapterType === "codex_remote"
                      ? "OPENAI_API_KEY (starts with sk-)"
                      : "GEMINI_API_KEY or GOOGLE_API_KEY"
                }
              >
                <DraftInput
                  type="password"
                  autoComplete="off"
                  value={plainValue}
                  onCommit={(v) => {
                    if (isCreate) {
                      const envBindings = { ...(val!.envBindings ?? {}) };
                      if (v?.trim()) envBindings[keyName] = { type: "plain", value: v.trim() };
                      else delete envBindings[keyName];
                      set!({ envBindings });
                    } else {
                      const next: Record<string, EnvBinding> = { ...(config.env ?? {}) };
                      if (v?.trim()) next[keyName] = { type: "plain", value: v.trim() };
                      else delete next[keyName];
                      mark("adapterConfig", "env", next);
                    }
                  }}
                  immediate
                  className={cn("ui-agent-form-cwd-input", apiKeyFormatError && "border-destructive")}
                  placeholder={t("agents:pasteApiKey")}
                />
                {apiKeyFormatError && (
                  <p className="text-xs text-destructive mt-1" role="alert">{apiKeyFormatError}</p>
                )}
              </Field>
            );
          })()}

          {/* Working directory (admin only) */}
          {isLocalOrSelfHostedLlm && canSetWorkingDirectory && (
            <Field label={t("agents:workingDirectory")} hint={t("agents:helpCwd")}>
              <div className="ui-agent-form-cwd-wrap">
                <FolderOpen className="ui-agent-form-icon-md ui-agent-form-muted" aria-hidden />
                <DraftInput
                  value={
                    isCreate
                      ? val!.cwd
                      : eff("adapterConfig", "cwd", String(config.cwd ?? ""))
                  }
                  onCommit={(v) =>
                    isCreate ? set!({ cwd: v }) : mark("adapterConfig", "cwd", v || undefined)
                  }
                  immediate
                  className="ui-agent-form-cwd-input"
                  placeholder="/path/to/project"
                />
                <ChoosePathButton />
              </div>
            </Field>
          )}

          {/* Prompt template (create mode only — edit mode shows this in Identity) */}
          {isLocalOrSelfHostedLlm && isCreate && (
            <Field label={t("agents:promptTemplate")} hint={t("agents:helpPromptTemplate")}>
              <MarkdownEditor
                value={val!.promptTemplate}
                onChange={(v) => set!({ promptTemplate: v })}
                placeholder={t("agents:promptTemplatePlaceholder")}
                contentClassName="min-h-[88px] text-sm font-mono"
                imageUploadHandler={async (file) => {
                  const namespace = "agents/drafts/prompt-template";
                  const asset = await uploadMarkdownImage.mutateAsync({ file, namespace });
                  return asset.contentPath;
                }}
              />
            </Field>
          )}

          {/* Adapter-specific fields */}
          <uiAdapter.ConfigFields {...adapterFieldProps} />
        </div>

      </div>

      {/* ---- Permissions & Configuration ---- */}
      {isLocal && (
        <div className={cn(!cards && "border-b border-border")}>
          {cards
            ? <h3 className="ui-agent-form-section-title mb-3">{t("agents:permissionsAndConfig")}</h3>
            : <div className="ui-agent-form-section-header-inline"><span className="ui-agent-form-section-title-inline">{t("agents:permissionsAndConfig")}</span></div>
          }
          <div className={cn(cards ? "ui-agent-form-card" : "ui-agent-form-body")}>
              <Field label={t("agents:command")} hint={t("agents:helpLocalCommand")}>
                <DraftInput
                  value={
                    isCreate
                      ? val!.command
                      : eff("adapterConfig", "command", String(config.command ?? ""))
                  }
                  onCommit={(v) =>
                    isCreate
                      ? set!({ command: v })
                      : mark("adapterConfig", "command", v || undefined)
                  }
                  immediate
                  className={inputClass}
                  placeholder={
                    adapterType === "codex_local"
                      ? "codex"
                      : adapterType === "gemini_local"
                        ? "gemini"
                      : adapterType === "cursor"
                        ? "agent"
                        : adapterType === "opencode_local"
                          ? "opencode"
                          : "claude"
                  }
                />
              </Field>

              <ModelDropdown
                models={models}
                value={currentModelId}
                onChange={(v) =>
                  isCreate
                    ? set!({ model: v })
                    : mark("adapterConfig", "model", v || undefined)
                }
                open={modelOpen}
                onOpenChange={setModelOpen}
                allowDefault={adapterType !== "opencode_local"}
                required={adapterType === "opencode_local"}
                groupByProvider={adapterType === "opencode_local"}
              />
              {fetchedModelsError && (
                <p className="ui-agent-form-muted-xs" style={{ color: "var(--destructive)" }}>
                  {fetchedModelsError instanceof Error
                    ? fetchedModelsError.message
                    : t("agents:failedToLoadAdapterModels")}
                </p>
              )}

              {showThinkingEffort && (
                <>
                  <ThinkingEffortDropdown
                    value={currentThinkingEffort}
                    options={thinkingEffortOptions}
                    onChange={(v) =>
                      isCreate
                        ? set!({ thinkingEffort: v })
                        : mark("adapterConfig", thinkingEffortKey, v || undefined)
                    }
                    open={thinkingEffortOpen}
                    onOpenChange={setThinkingEffortOpen}
                  />
                  {(adapterType === "codex_local" || adapterType === "codex_remote") &&
                    codexSearchEnabled &&
                    currentThinkingEffort === "minimal" && (
                      <p className="ui-agent-form-muted-xs ui-agent-form-amber">
                        Codex may reject `minimal` thinking when search is enabled.
                      </p>
                    )}
                </>
              )}
              <Field label={t("agents:bootstrapPromptFirstRun")} hint={t("agents:helpBootstrapPrompt")}>
                <MarkdownEditor
                  value={
                    isCreate
                      ? val!.bootstrapPrompt
                      : eff(
                          "adapterConfig",
                          "bootstrapPromptTemplate",
                          String(config.bootstrapPromptTemplate ?? ""),
                        )
                  }
                  onChange={(v) =>
                    isCreate
                      ? set!({ bootstrapPrompt: v })
                      : mark("adapterConfig", "bootstrapPromptTemplate", v || undefined)
                  }
                  placeholder={t("agents:bootstrapPromptPlaceholder")}
                  contentClassName="min-h-[44px] text-sm font-mono"
                  imageUploadHandler={async (file) => {
                    const namespace = isCreate
                      ? "agents/drafts/bootstrap-prompt"
                      : `agents/${props.agent.id}/bootstrap-prompt`;
                    const asset = await uploadMarkdownImage.mutateAsync({ file, namespace });
                    return asset.contentPath;
                  }}
                />
              </Field>
              {adapterType === "claude_local" && (
                <ClaudeLocalAdvancedFields {...adapterFieldProps} />
              )}

              <Field label={t("agents:extraArgs")} hint={t("agents:helpExtraArgs")}>
                <DraftInput
                  value={
                    isCreate
                      ? val!.extraArgs
                      : eff("adapterConfig", "extraArgs", formatArgList(config.extraArgs))
                  }
                  onCommit={(v) =>
                    isCreate
                      ? set!({ extraArgs: v })
                      : mark("adapterConfig", "extraArgs", v ? parseCommaArgs(v) : undefined)
                  }
                  immediate
                  className={inputClass}
                  placeholder={t("agents:extraArgsPlaceholder")}
                />
              </Field>

              <Field label={t("agents:environmentVariables")} hint={t("agents:helpEnvVars")}>
                <EnvVarEditor
                  value={
                    isCreate
                      ? ((val!.envBindings ?? EMPTY_ENV) as Record<string, EnvBinding>)
                      : ((eff("adapterConfig", "env", (config.env ?? EMPTY_ENV) as Record<string, EnvBinding>))
                      )
                  }
                  secrets={availableSecrets}
                  onCreateSecret={async (name, value) => {
                    const created = await createSecret.mutateAsync({ name, value });
                    return created;
                  }}
                  onChange={(env) =>
                    isCreate
                      ? set!({ envBindings: env ?? {}, envVars: "" })
                      : mark("adapterConfig", "env", env)
                  }
                />
              </Field>

              {/* Edit-only: timeout + grace period */}
              {!isCreate && (
                <>
                  <Field label={t("agents:timeoutSec")} hint={t("agents:helpTimeoutSec")}>
                    <DraftNumberInput
                      value={eff(
                        "adapterConfig",
                        "timeoutSec",
                        Number(config.timeoutSec ?? 0),
                      )}
                      onCommit={(v) => mark("adapterConfig", "timeoutSec", v)}
                      immediate
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("agents:interruptGracePeriodSec")} hint={t("agents:helpGraceSec")}>
                    <DraftNumberInput
                      value={eff(
                        "adapterConfig",
                        "graceSec",
                        Number(config.graceSec ?? 15),
                      )}
                      onCommit={(v) => mark("adapterConfig", "graceSec", v)}
                      immediate
                      className={inputClass}
                    />
                  </Field>
                </>
              )}
          </div>
        </div>
      )}

      {/* ---- Run Policy ---- */}
      {isCreate ? (
        <div className={cn(!cards && "border-b border-border")}>
          {cards
            ? <h3 className="ui-agent-form-section-title mb-3 ui-agent-form-row"><Heart className="ui-agent-form-icon-sm" aria-hidden /> {t("agents:runPolicy")}</h3>
            : <div className="ui-agent-form-section-header-inline"><Heart className="ui-agent-form-icon-sm" aria-hidden /><span className="ui-agent-form-section-title-inline">{t("agents:runPolicy")}</span></div>
          }
          <div className={cn(cards ? "border border-border rounded-lg p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
            <ToggleWithNumber
              label={t("agents:heartbeatOnInterval")}
              hint={t("agents:helpHeartbeatInterval")}
              checked={val!.heartbeatEnabled}
              onCheckedChange={(v) => set!({ heartbeatEnabled: v })}
              number={val!.intervalSec}
              onNumberChange={(v) => set!({ intervalSec: v })}
              numberLabel={t("agents:sec")}
              numberPrefix={t("agents:runHeartbeatEvery")}
              numberHint={t("agents:helpIntervalSec")}
              showNumber={val!.heartbeatEnabled}
            />
          </div>
        </div>
      ) : (
        <div className={cn(!cards && "border-b border-border")}>
          {cards
            ? <h3 className="ui-agent-form-section-title mb-3 ui-agent-form-row"><Heart className="ui-agent-form-icon-sm" aria-hidden /> {t("agents:runPolicy")}</h3>
            : <div className="ui-agent-form-section-header-inline"><Heart className="ui-agent-form-icon-sm" aria-hidden /><span className="ui-agent-form-section-title-inline">{t("agents:runPolicy")}</span></div>
          }
          <div className={cn(cards ? "border border-border rounded-lg overflow-hidden" : "")}>
            <div className={cn(cards ? "p-4 space-y-3" : "px-4 pb-3 space-y-3")}>
              <ToggleWithNumber
                label={t("agents:heartbeatOnInterval")}
                hint={t("agents:helpHeartbeatInterval")}
                checked={eff("heartbeat", "enabled", heartbeat.enabled !== false)}
                onCheckedChange={(v) => mark("heartbeat", "enabled", v)}
                number={eff("heartbeat", "intervalSec", Number(heartbeat.intervalSec ?? 300))}
                onNumberChange={(v) => mark("heartbeat", "intervalSec", v)}
                numberLabel={t("agents:sec")}
                numberPrefix={t("agents:runHeartbeatEvery")}
                numberHint={t("agents:helpIntervalSec")}
                showNumber={eff("heartbeat", "enabled", heartbeat.enabled !== false)}
              />
            </div>
            <CollapsibleSection
              title={t("agents:advancedRunPolicy")}
              bordered={cards}
              open={runPolicyAdvancedOpen}
              onToggle={() => setRunPolicyAdvancedOpen(!runPolicyAdvancedOpen)}
            >
            <div className="ui-agent-form-space-y-3">
              <ToggleField
                label={t("agents:wakeOnDemand")}
                hint={t("agents:helpWakeOnDemand")}
                checked={eff(
                  "heartbeat",
                  "wakeOnDemand",
                  heartbeat.wakeOnDemand !== false,
                )}
                onChange={(v) => mark("heartbeat", "wakeOnDemand", v)}
              />
              <Field label={t("agents:cooldownSec")} hint={t("agents:helpCooldownSec")}>
                <DraftNumberInput
                  value={eff(
                    "heartbeat",
                    "cooldownSec",
                    Number(heartbeat.cooldownSec ?? 10),
                  )}
                  onCommit={(v) => mark("heartbeat", "cooldownSec", v)}
                  immediate
                  className={inputClass}
                />
              </Field>
              <Field label={t("agents:maxConcurrentRuns")} hint={t("agents:helpMaxConcurrentRuns")}>
                <DraftNumberInput
                  value={eff(
                    "heartbeat",
                    "maxConcurrentRuns",
                    Number(heartbeat.maxConcurrentRuns ?? 10),
                  )}
                  onCommit={(v) => mark("heartbeat", "maxConcurrentRuns", v)}
                  immediate
                  className={inputClass}
                />
              </Field>
            </div>
          </CollapsibleSection>
          </div>
        </div>
      )}

    </div>
  );
}

function AdapterEnvironmentResult({ result }: { result: AdapterEnvironmentTestResult }) {
  const statusLabel =
    result.status === "pass" ? "Passed" : result.status === "warn" ? "Warnings" : "Failed";
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
        ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
        : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="ui-agent-form-section-title">{statusLabel}</span>
        <span className="ui-agent-form-seal-hint">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="ui-agent-form-check">
        {result.checks.map((check, idx) => (
          <div key={`${check.code}-${idx}`} className="ui-agent-form-check-line">
            <span className="ui-agent-form-check-label">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && <span className="block opacity-75 break-all">({check.detail})</span>}
            {check.hint && <span className="block opacity-90 break-words">Hint: {check.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Internal sub-components ---- */

const ENABLED_ADAPTER_TYPES = new Set([
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "gemini_local",
  "gemini_remote",
  "opencode_local",
  "cursor",
  "local_self_hosted_llm",
]);

/** Display list includes all real adapter types plus UI-only coming-soon entries. */
const ADAPTER_DISPLAY_LIST: { value: string; label: string; comingSoon: boolean }[] = [
  ...AGENT_ADAPTER_TYPES.map((t) => ({
    value: t,
    label: adapterLabels[t] ?? t,
    comingSoon: !ENABLED_ADAPTER_TYPES.has(t),
  })),
];

function AdapterTypeDropdown({
  value,
  allowedTypes,
  onChange,
}: {
  value: string;
  allowedTypes?: string[];
  onChange: (type: string) => void;
}) {
  const list = allowedTypes
    ? ADAPTER_DISPLAY_LIST.filter((item) => allowedTypes.includes(item.value))
    : ADAPTER_DISPLAY_LIST;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="ui-agent-form-select-trigger">
          <span className="inline-flex items-center gap-1.5">
            {value === "opencode_local" ? <OpenCodeLogoIcon className="h-3.5 w-3.5" /> : null}
            <span>{adapterLabels[value] ?? value}</span>
          </span>
          <ChevronDown className="ui-agent-form-icon-sm ui-agent-form-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="ui-agent-form-popover" align="start">
        {list.map((item) => (
          <button
            key={item.value}
            disabled={item.comingSoon}
            className={cn(
              "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded",
              item.comingSoon
                ? "opacity-40 cursor-not-allowed"
                : "hover:bg-accent/50",
              item.value === value && !item.comingSoon && "bg-accent",
            )}
            onClick={() => {
              if (!item.comingSoon) onChange(item.value);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {item.value === "opencode_local" ? <OpenCodeLogoIcon className="h-3.5 w-3.5" /> : null}
              <span>{item.label}</span>
            </span>
            {item.comingSoon && (
              <span className="ui-agent-form-model-group-label">Coming soon</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function EnvVarEditor({
  value,
  secrets,
  onCreateSecret,
  onChange,
}: {
  value: Record<string, EnvBinding>;
  secrets: CompanySecret[];
  onCreateSecret: (name: string, value: string) => Promise<CompanySecret>;
  onChange: (env: Record<string, EnvBinding> | undefined) => void;
}) {
  const { t } = useTranslation("agents");
  type Row = {
    key: string;
    source: "plain" | "secret";
    plainValue: string;
    secretId: string;
  };

  function toRows(rec: Record<string, EnvBinding> | null | undefined): Row[] {
    if (!rec || typeof rec !== "object") {
      return [{ key: "", source: "plain", plainValue: "", secretId: "" }];
    }
    const entries = Object.entries(rec).map(([k, binding]) => {
      if (typeof binding === "string") {
        return {
          key: k,
          source: "plain" as const,
          plainValue: binding,
          secretId: "",
        };
      }
      if (
        typeof binding === "object" &&
        binding !== null &&
        "type" in binding &&
        (binding as { type?: unknown }).type === "secret_ref"
      ) {
        const recBinding = binding as { secretId?: unknown };
        return {
          key: k,
          source: "secret" as const,
          plainValue: "",
          secretId: typeof recBinding.secretId === "string" ? recBinding.secretId : "",
        };
      }
      if (
        typeof binding === "object" &&
        binding !== null &&
        "type" in binding &&
        (binding as { type?: unknown }).type === "plain"
      ) {
        const recBinding = binding as { value?: unknown };
        return {
          key: k,
          source: "plain" as const,
          plainValue: typeof recBinding.value === "string" ? recBinding.value : "",
          secretId: "",
        };
      }
      return {
        key: k,
        source: "plain" as const,
        plainValue: "",
        secretId: "",
      };
    });
    return [...entries, { key: "", source: "plain", plainValue: "", secretId: "" }];
  }

  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const [sealError, setSealError] = useState<string | null>(null);
  const valueRef = useRef(value);

  // Sync when value identity changes (overlay reset after save)
  useEffect(() => {
    if (value !== valueRef.current) {
      valueRef.current = value;
      setRows(toRows(value));
    }
  }, [value]);

  function emit(nextRows: Row[]) {
    const rec: Record<string, EnvBinding> = {};
    for (const row of nextRows) {
      const k = row.key.trim();
      if (!k) continue;
      if (row.source === "secret") {
        if (!row.secretId) continue;
        rec[k] = { type: "secret_ref", secretId: row.secretId, version: "latest" };
      } else {
        rec[k] = { type: "plain", value: row.plainValue };
      }
    }
    onChange(Object.keys(rec).length > 0 ? rec : undefined);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    const withPatch = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    if (
      withPatch[withPatch.length - 1].key ||
      withPatch[withPatch.length - 1].plainValue ||
      withPatch[withPatch.length - 1].secretId
    ) {
      withPatch.push({ key: "", source: "plain", plainValue: "", secretId: "" });
    }
    setRows(withPatch);
    emit(withPatch);
  }

  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    if (
      next.length === 0 ||
      next[next.length - 1].key ||
      next[next.length - 1].plainValue ||
      next[next.length - 1].secretId
    ) {
      next.push({ key: "", source: "plain", plainValue: "", secretId: "" });
    }
    setRows(next);
    emit(next);
  }

  function defaultSecretName(key: string): string {
    return key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);
  }

  async function sealRow(i: number) {
    const row = rows[i];
    if (!row) return;
    const key = row.key.trim();
    const plain = row.plainValue;
    if (!key || plain.length === 0) return;

    const suggested = defaultSecretName(key) || "secret";
    const name = window.prompt(t("secretNamePrompt"), suggested)?.trim();
    if (!name) return;

    try {
      setSealError(null);
      const created = await onCreateSecret(name, plain);
      updateRow(i, {
        source: "secret",
        secretId: created.id,
      });
    } catch (err) {
      setSealError(err instanceof Error ? err.message : t("failedToCreateSecret"));
    }
  }

  return (
    <div className="ui-agent-form-list">
      {rows.map((row, i) => {
        const isTrailing =
          i === rows.length - 1 &&
          !row.key &&
          !row.plainValue &&
          !row.secretId;
        return (
          <div key={i} className="ui-agent-form-list-item">
            <input
              className={cn(inputClass, "flex-[2]")}
              placeholder={t("envVarKeyPlaceholder")}
              value={row.key}
              onChange={(e) => updateRow(i, { key: e.target.value })}
            />
            <select
              className={cn(inputClass, "flex-[1] bg-background")}
              value={row.source}
              onChange={(e) =>
                updateRow(i, {
                  source: e.target.value === "secret" ? "secret" : "plain",
                  ...(e.target.value === "plain" ? { secretId: "" } : {}),
                })
              }
            >
              <option value="plain">{t("envVarPlain")}</option>
              <option value="secret">{t("envVarSecret")}</option>
            </select>
            {row.source === "secret" ? (
              <>
                <select
                  className={cn(inputClass, "flex-[3] bg-background")}
                  value={row.secretId}
                  onChange={(e) => updateRow(i, { secretId: e.target.value })}
                >
                  <option value="">{t("selectSecret")}</option>
                  {secrets.map((secret) => (
                    <option key={secret.id} value={secret.id}>
                      {secret.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ui-agent-form-tag"
                  onClick={() => sealRow(i)}
                  disabled={!row.key.trim() || !row.plainValue}
                  title={t("createSecretFromPlainTitle")}
                >
                  {t("envVarNew")}
                </button>
              </>
            ) : (
              <>
                <input
                  className={cn(inputClass, "flex-[3]")}
                  placeholder={t("envVarValuePlaceholder")}
                  value={row.plainValue}
                  onChange={(e) => updateRow(i, { plainValue: e.target.value })}
                />
                <button
                  type="button"
                  className="ui-agent-form-tag"
                  onClick={() => sealRow(i)}
                  disabled={!row.key.trim() || !row.plainValue}
                  title={t("storeAsSecretTitle")}
                >
                  {t("envVarSeal")}
                </button>
              </>
            )}
            {!isTrailing ? (
              <button
                type="button"
                className="ui-agent-form-tag-remove"
                onClick={() => removeRow(i)}
              >
                <X className="ui-agent-form-icon-md" aria-hidden />
              </button>
            ) : (
              <div className="w-[26px] shrink-0" />
            )}
          </div>
        );
      })}
      {sealError && <p className="ui-agent-form-seal-hint" style={{ color: "var(--destructive)" }}>{sealError}</p>}
      <p className="ui-agent-form-seal-hint">
        {t("paperclipVarsInjected")}
      </p>
    </div>
  );
}

function ModelDropdown({
  models,
  value,
  onChange,
  open,
  onOpenChange,
  allowDefault,
  required,
  groupByProvider,
}: {
  models: AdapterModel[];
  value: string;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowDefault: boolean;
  required: boolean;
  groupByProvider: boolean;
}) {
  const { t } = useTranslation("agents");
  const [modelSearch, setModelSearch] = useState("");
  const selected = models.find((m) => m.id === value);
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (!modelSearch.trim()) return true;
      const q = modelSearch.toLowerCase();
      const provider = extractProviderId(m.id) ?? "";
      return (
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        provider.toLowerCase().includes(q)
      );
    });
  }, [models, modelSearch]);
  const groupedModels = useMemo(() => {
    if (!groupByProvider) {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id)),
        },
      ];
    }
    const map = new Map<string, AdapterModel[]>();
    for (const model of filteredModels) {
      const provider = extractProviderId(model.id) ?? "other";
      const group = map.get(provider) ?? [];
      group.push(model);
      map.set(provider, group);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
      }));
  }, [filteredModels, groupByProvider]);

  return (
    <Field label={t("model")} hint={t("helpModel")}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          onOpenChange(nextOpen);
          if (!nextOpen) setModelSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className="ui-agent-form-select-trigger">
            <span className={cn(!value && "text-muted-foreground")}>
              {selected
                ? selected.label
                : value || (allowDefault ? t("default") : required ? t("selectModelRequired") : t("selectModel"))}
            </span>
            <ChevronDown className="ui-agent-form-icon-sm ui-agent-form-muted" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="ui-agent-form-popover" align="start">
          <input
            className="ui-agent-form-model-search"
            placeholder={t("searchModels")}
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            autoFocus
          />
          <div className="ui-agent-form-model-list">
            {allowDefault && (
              <button
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                  !value && "bg-accent",
                )}
                onClick={() => {
                  onChange("");
                  onOpenChange(false);
                }}
              >
                {t("default")}
              </button>
            )}
            {groupedModels.map((group) => (
              <div key={group.provider} className="mb-1 last:mb-0">
                {groupByProvider && (
                  <div className="ui-agent-form-model-group-label">
                    {group.provider} ({group.entries.length})
                  </div>
                )}
                {group.entries.map((m) => (
                  <button
                    key={m.id}
                    className={cn(
                      "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                      m.id === value && "bg-accent",
                    )}
                    onClick={() => {
                      onChange(m.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="block w-full text-left truncate" title={m.id}>
                      {groupByProvider ? extractModelName(m.id) : m.label}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filteredModels.length === 0 && (
              <p className="ui-agent-form-model-empty">{t("noModelsFound")}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function ThinkingEffortDropdown({
  value,
  options,
  onChange,
  open,
  onOpenChange,
}: {
  value: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("agents");
  const selected = options.find((option) => option.id === value) ?? options[0];

  return (
    <Field label={t("thinkingEffort")} hint={t("helpThinkingEffort")}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" className="ui-agent-form-select-trigger">
            <span className={cn(!value && "text-muted-foreground")}>{selected?.label ?? t("auto")}</span>
            <ChevronDown className="ui-agent-form-icon-sm ui-agent-form-muted" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="ui-agent-form-popover" align="start">
          {options.map((option) => (
            <button
              key={option.id || "auto"}
              className={cn(
                "flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                option.id === value && "bg-accent",
              )}
              onClick={() => {
                onChange(option.id);
                onOpenChange(false);
              }}
            >
              <span>{option.label}</span>
              {option.id ? <span className="text-xs text-muted-foreground font-mono">{option.id}</span> : null}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </Field>
  );
}
