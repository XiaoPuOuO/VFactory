import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdapterEnvironmentTestResult,
  CompanyPortabilityCollisionStrategy,
  CompanyPortabilityImportRequest,
  CompanyPortabilityManifest,
  CompanyPortabilityPreviewResult,
} from "@paperclipai/shared";
import { adapterRequiresApiKeyInput, API_KEY_ENV_BY_ADAPTER, validateApiKeyFormat } from "../lib/api-key-validation";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { meApi } from "../api/me";
import { secretsApi } from "../api/secrets";
import {
  buildNewCompanyImportRequest,
  fetchOfficialTemplateCatalog,
  loadOfficialTemplateInlineSource,
} from "../lib/company-portability";
import { queryKeys } from "../lib/queryKeys";
import { ApiError } from "../api/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import "./OnboardingWizard.css";
import {
  extractModelName,
  extractProviderIdWithFallback
} from "../lib/model-utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import { ChoosePathButton } from "./PathInstructionsModal";
import { HintIcon } from "./agent-config-primitives";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import {
  Building2,
  Bot,
  Code,
  Gem,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Terminal,
  Sparkles,
  MousePointer2,
  Cpu,
  Check,
  Loader2,
  FolderOpen,
  ChevronDown,
  X
} from "lucide-react";

type Step = 1 | 2 | 3 | 4;
type AdapterType =
  | "claude_local"
  | "claude_remote"
  | "codex_local"
  | "codex_remote"
  | "gemini_local"
  | "gemini_remote"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "local_self_hosted_llm"
  | "process"
  | "http"
  | "openclaw_gateway";

const DEFAULT_TASK_DESCRIPTION = `Setup yourself as the CEO. Use the ceo persona found here: 

https://github.com/paperclipai/companies/blob/main/default/ceo/AGENTS.md

Ensure you have a folder agents/ceo and then download this AGENTS.md, and sibling HEARTBEAT.md, SOUL.md, and TOOLS.md. and set that AGENTS.md as the path to your agents instruction file

After that, hire yourself a Founding Engineer agent and then plan the roadmap and tasks for your new company.`;

export function OnboardingWizard() {
  const { t } = useTranslation(["onboarding", "adapter", "common"]);
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { selectedCompanyId, companies, setSelectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initialStep = onboardingOptions.initialStep ?? 1;
  const existingCompanyId = onboardingOptions.companyId;

  // Created entity IDs — must be declared before useQuery(allowedAdapterTypes) which references createdCompanyId
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  const { data: meProfile } = useQuery({ queryKey: ["me"], queryFn: () => meApi.get(), retry: false });
  const canSetWorkingDirectory = meProfile?.group === "admin";

  const { data: allowedAdapterData } = useQuery({
    queryKey: createdCompanyId ? queryKeys.companies.allowedAdapterTypes(createdCompanyId) : ["companies", "none", "allowed-adapter-types"],
    queryFn: () => companiesApi.allowedAdapterTypes(createdCompanyId!),
    enabled: Boolean(createdCompanyId) && onboardingOpen,
  });
  const allowedAdapterTypes = allowedAdapterData?.adapterTypes ?? null;
  const canUseAllAdapters = (allowedAdapterTypes?.length ?? 0) >= 11;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  // Step 1：公司名稱與公司介紹
  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");
  /** 空白建立 vs 官方模板（僅步驟 1、非既有公司流程） */
  const [creationMode, setCreationMode] = useState<"blank" | "template">("blank");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateImportDialogOpen, setTemplateImportDialogOpen] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<CompanyPortabilityPreviewResult | null>(null);
  const [pendingImportRequest, setPendingImportRequest] = useState<CompanyPortabilityImportRequest | null>(null);
  const [templateCollisionStrategy, setTemplateCollisionStrategy] =
    useState<CompanyPortabilityCollisionStrategy>("rename");
  const [importedFromTemplate, setImportedFromTemplate] = useState(false);
  const [importedAgentNames, setImportedAgentNames] = useState<string[]>([]);
  /** 已載入之官方模板內容，供在預覽對話框內切換 collision 策略時重新 preview。 */
  const [templateBundle, setTemplateBundle] = useState<{
    manifest: CompanyPortabilityManifest;
    files: Record<string, string>;
  } | null>(null);

  // Step 2
  const [agentName, setAgentName] = useState("CEO");
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [cwd, setCwd] = useState("");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState(defaultCreateValues.baseUrl);
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  // Step 3
  const [taskTitle, setTaskTitle] = useState("Create your CEO HEARTBEAT.md");
  const [taskDescription, setTaskDescription] = useState(
    DEFAULT_TASK_DESCRIPTION
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!onboardingOpen) return;
    const cId = onboardingOptions.companyId ?? null;
    setStep(onboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
    if (cId) {
      setCreationMode("blank");
    } else if (onboardingOptions.creationMode === "template") {
      setCreationMode("template");
    } else {
      setCreationMode("blank");
    }
    setTemplateId(null);
    setImportedFromTemplate(false);
    setImportedAgentNames([]);
    setTemplateImportDialogOpen(false);
    setTemplatePreview(null);
    setPendingImportRequest(null);
    setTemplateBundle(null);
  }, [
    onboardingOpen,
    onboardingOptions.companyId,
    onboardingOptions.initialStep,
    onboardingOptions.creationMode,
  ]);

  const { data: templateCatalog } = useQuery({
    queryKey: ["official-templates", "catalog"],
    queryFn: fetchOfficialTemplateCatalog,
    enabled:
      onboardingOpen &&
      step === 1 &&
      creationMode === "template" &&
      !onboardingOptions.companyId,
  });

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!onboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [onboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Sync adapter selection when on step 2: if current type not in allowed list, pick first allowed.
  useEffect(() => {
    if (step !== 2 || !allowedAdapterTypes?.length) return;
    if (allowedAdapterTypes.includes(adapterType)) return;
    const first = allowedAdapterTypes[0];
    if (first) setAdapterType(first as AdapterType);
  }, [step, allowedAdapterTypes, adapterType]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  const { data: createdCompany } = useQuery({
    queryKey: queryKeys.companies.detail(createdCompanyId!),
    queryFn: () => companiesApi.get(createdCompanyId!),
    enabled: Boolean(createdCompanyId) && onboardingOpen && step === 2
  });

  useEffect(() => {
    if (step !== 2 || !createdCompany || cwd !== "") return;
    const path =
      createdCompany.workingDirectory?.trim() ??
      (createdCompany as { effectiveWorkingDirectory?: string | null }).effectiveWorkingDirectory ??
      "";
    if (path) setCwd(path);
  }, [step, createdCompany, cwd]);

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching
  } = useQuery({
    queryKey: createdCompanyId
      ? queryKeys.agents.adapterModels(createdCompanyId, adapterType)
      : ["agents", "none", "adapter-models", adapterType],
    queryFn: () => agentsApi.adapterModels(createdCompanyId!, adapterType),
    enabled: Boolean(createdCompanyId) && onboardingOpen && step === 2
  });
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "claude_remote" ||
    adapterType === "codex_local" ||
    adapterType === "codex_remote" ||
    adapterType === "gemini_local" ||
    adapterType === "gemini_remote" ||
    adapterType === "opencode_local" ||
    adapterType === "cursor" ||
    adapterType === "local_self_hosted_llm";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local" || adapterType === "codex_remote"
      ? "codex"
      : adapterType === "gemini_local" || adapterType === "gemini_remote"
        ? "gemini"
        : adapterType === "cursor"
          ? "agent"
          : adapterType === "opencode_local"
            ? "opencode"
            : "claude");

  useEffect(() => {
    if (step !== 2) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, cwd, model, command, args, url, llmBaseUrl]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;
  /** Remote adapters require API Key; local adapters must not set it. */
  const requiresApiKey = adapterRequiresApiKeyInput(adapterType);
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);
  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id))
        }
      ];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id))
      }));
  }, [filteredModels, adapterType]);

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyDescription("");
    setCreationMode("blank");
    setTemplateId(null);
    setTemplateImportDialogOpen(false);
    setTemplatePreview(null);
    setPendingImportRequest(null);
    setTemplateCollisionStrategy("rename");
    setImportedFromTemplate(false);
    setImportedAgentNames([]);
    setTemplateBundle(null);
    setAgentName("CEO");
    setAdapterType("claude_local");
    setCwd("");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setApiKey("");
    setLlmBaseUrl(defaultCreateValues.baseUrl);
    setShowMoreAdapters(false);
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setTaskTitle("Create your CEO HEARTBEAT.md");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    setTemplateImportDialogOpen(false);
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(apiKeySecretRef?: { keyName: string; secretId: string } | null): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const localSelfHostedOverrides =
      adapterType === "local_self_hosted_llm"
        ? {
            baseUrl: llmBaseUrl.trim() || defaultCreateValues.baseUrl,
            envBindings:
              apiKey.trim().length > 0
                ? { ...defaultCreateValues.envBindings, apiKey: apiKey.trim() }
                : defaultCreateValues.envBindings,
          }
        : {};
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      ...localSelfHostedOverrides,
      adapterType,
      cwd,
      model:
        adapterType === "codex_local" || adapterType === "codex_remote"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "gemini_local" || adapterType === "gemini_remote"
            ? model || DEFAULT_GEMINI_LOCAL_MODEL
            : adapterType === "cursor"
              ? model || DEFAULT_CURSOR_LOCAL_MODEL
              : model,
      command,
      args,
      url,
      dangerouslySkipPermissions: adapterType === "claude_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local" || adapterType === "codex_remote"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox
    });
    const env =
      typeof config.env === "object" &&
      config.env !== null &&
      !Array.isArray(config.env)
        ? { ...(config.env as Record<string, unknown>) }
        : {};
    if (apiKeySecretRef) {
      env[apiKeySecretRef.keyName] = { type: "secret_ref", secretId: apiKeySecretRef.secretId, version: "latest" as const };
    } else if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
    } else if (requiresApiKey && apiKey.trim()) {
      const keyName = API_KEY_ENV_BY_ADAPTER[adapterType];
      if (keyName) env[keyName] = { type: "plain", value: apiKey.trim() };
    }
    config.env = env;
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        "Create or select a company before testing adapter environment."
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error ? err.message : "Adapter environment test failed"
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const description = companyDescription.trim();
      const company = await companiesApi.create({
        name: companyName.trim(),
        ...(description ? { description } : {}),
      });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      setCwd(
        company.workingDirectory?.trim() ??
        (company as { effectiveWorkingDirectory?: string | null }).effectiveWorkingDirectory ??
        ""
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplatePreviewAndOpenDialog() {
    if (!templateId || !companyName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const bundle = await loadOfficialTemplateInlineSource(templateId);
      setTemplateBundle(bundle);
      const req = buildNewCompanyImportRequest(
        bundle.manifest,
        bundle.files,
        companyName,
        templateCollisionStrategy,
      );
      const preview = await companiesApi.importPreview(req);
      setPendingImportRequest(req);
      setTemplatePreview(preview);
      if (preview.errors.length > 0) {
        setError(preview.errors.join("; "));
        return;
      }
      setTemplateImportDialogOpen(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding:templatePreviewFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTemplateCollisionChange(next: CompanyPortabilityCollisionStrategy) {
    setTemplateCollisionStrategy(next);
    if (!templateBundle || !companyName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const req = buildNewCompanyImportRequest(
        templateBundle.manifest,
        templateBundle.files,
        companyName,
        next,
      );
      const preview = await companiesApi.importPreview(req);
      setPendingImportRequest(req);
      setTemplatePreview(preview);
      if (preview.errors.length > 0) {
        setError(preview.errors.join("; "));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding:templatePreviewFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmTemplateImport() {
    if (!pendingImportRequest) return;
    setLoading(true);
    setError(null);
    try {
      const body: CompanyPortabilityImportRequest = {
        ...pendingImportRequest,
        collisionStrategy: templateCollisionStrategy,
      };
      const result = await companiesApi.importBundle(body);
      const company = await companiesApi.get(result.company.id);
      setCreatedCompanyId(result.company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(result.company.id);
      setCwd(
        company.workingDirectory?.trim() ??
          (company as { effectiveWorkingDirectory?: string | null })
            .effectiveWorkingDirectory ??
          "",
      );
      const ceo = result.agents.find((a) => a.slug === "ceo" && a.id);
      const assignee =
        ceo ?? result.agents.find((a) => a.id && a.action !== "skipped");
      if (assignee?.id) setCreatedAgentId(assignee.id);
      setAgentName(assignee?.name ?? "CEO");
      setImportedAgentNames(
        result.agents.filter((a) => a.id).map((a) => a.name),
      );
      setImportedFromTemplate(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(result.company.id),
      });
      setTemplateImportDialogOpen(false);
      setTemplatePreview(null);
      setPendingImportRequest(null);
      setTemplateBundle(null);
      setStep(3);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("onboarding:templateImportFailed"),
      );
    } finally {
      setLoading(false);
    }
  }

  const apiKeyValidationError = requiresApiKey
    ? (apiKey.trim() ? validateApiKeyFormat(adapterType, apiKey) : "API Key is required.")
    : null;
  const canProceedStep2 =
    (!requiresApiKey || (apiKey.trim() !== "" && !apiKeyValidationError)) &&
    (adapterType !== "local_self_hosted_llm" || Boolean(model.trim()));

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    if (requiresApiKey) {
      if (!apiKey.trim()) {
        setError("Please enter your API Key.");
        return;
      }
      const formatError = validateApiKeyFormat(adapterType, apiKey);
      if (formatError) {
        setError(formatError);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      let apiKeySecretRef: { keyName: string; secretId: string } | null = null;
      if (requiresApiKey && apiKey.trim()) {
        const keyName = API_KEY_ENV_BY_ADAPTER[adapterType];
        if (keyName) {
          try {
            const secret = await secretsApi.create(createdCompanyId, {
              name: keyName,
              value: apiKey.trim(),
            });
            apiKeySecretRef = { keyName, secretId: secret.id };
          } catch (createErr) {
            if (createErr instanceof ApiError && createErr.status === 409) {
              const secrets = await secretsApi.list(createdCompanyId);
              const existing = secrets.find((s) => s.name === keyName);
              if (existing) {
                await secretsApi.rotate(existing.id, { value: apiKey.trim() });
                apiKeySecretRef = { keyName, secretId: existing.id };
              } else {
                throw createErr;
              }
            } else {
              throw createErr;
            }
          }
        }
      }

      if (adapterType === "local_self_hosted_llm") {
        if (!model.trim()) {
          setError(t("onboarding:localSelfHostedModelRequired"));
          return;
        }
      }

      if (adapterType === "opencode_local") {
        const selectedModelId = model.trim();
        if (!selectedModelId) {
          setError(
            "OpenCode requires an explicit model in provider/model format."
          );
          return;
        }
        if (adapterModelsError) {
          setError(
            adapterModelsError instanceof Error
              ? adapterModelsError.message
              : "Failed to load OpenCode models."
          );
          return;
        }
        if (adapterModelsLoading || adapterModelsFetching) {
          setError(
            "OpenCode models are still loading. Please wait and try again."
          );
          return;
        }
        const discoveredModels = adapterModels ?? [];
        if (!discoveredModels.some((entry) => entry.id === selectedModelId)) {
          setError(
            discoveredModels.length === 0
              ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
              : `Configured OpenCode model is unavailable: ${selectedModelId}`
          );
          return;
        }
      }

      if (isLocalAdapter) {
        const configForTest = buildAdapterConfig(apiKeySecretRef ?? undefined);
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest(configForTest));
        if (!result) return;
      }

      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(apiKeySecretRef ?? undefined),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 10
          }
        }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId)
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(
          "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to unset ANTHROPIC_API_KEY and retry."
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      const issue = await issuesApi.create(createdCompanyId, {
        title: taskTitle.trim(),
        ...(taskDescription.trim()
          ? { description: taskDescription.trim() }
          : {}),
        assigneeAgentId: createdAgentId,
        status: "todo"
      });
      setCreatedIssueRef(issue.identifier ?? issue.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(createdCompanyId)
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch() {
    if (!createdAgentId) return;
    setLoading(true);
    setError(null);
    setLoading(false);
    reset();
    closeOnboarding();
    if (createdCompanyPrefix) {
      navigate(`/${createdCompanyPrefix}/dashboard`);
      return;
    }
    navigate("/dashboard");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) {
        if (creationMode === "template" && templateId && !existingCompanyId) {
          void handleTemplatePreviewAndOpenDialog();
        } else if (creationMode === "blank") {
          handleStep1Next();
        }
      }
      else if (
        step === 2 &&
        agentName.trim() &&
        canProceedStep2 &&
        (!adapterRequiresApiKeyInput(adapterType) || adapterEnvResult?.status === "pass")
      )
        handleStep2Next();
      else if (step === 3 && taskTitle.trim()) handleStep3Next();
      else if (step === 4) handleLaunch();
    }
  }

  if (!onboardingOpen) return null;

  return (
    <>
    <Dialog
      open={onboardingOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogPortal>
        {/* Plain div instead of DialogOverlay — Radix's overlay wraps in
            RemoveScroll which blocks wheel events on our custom (non-DialogContent)
            scroll container. A plain div preserves the background without scroll-locking. */}
        <div className="onboarding-wizard-backdrop" />
        <div className="onboarding-wizard-root" onKeyDown={handleKeyDown}>
          <button
            type="button"
            onClick={handleClose}
            className="onboarding-wizard-close"
            aria-label={t("common:close")}
          >
            <X aria-hidden />
            <span className="sr-only">{t("onboarding:close")}</span>
          </button>

          <div className={cn("onboarding-wizard-panel", `step-${step}`)}>
            <div className="onboarding-wizard-inner">
              <div className="onboarding-wizard-tabs">
                {(
                  [
                    { step: 1 as Step, labelKey: "company" as const, icon: Building2 },
                    { step: 2 as Step, labelKey: "agent" as const, icon: Bot },
                    { step: 3 as Step, labelKey: "task" as const, icon: ListTodo },
                    { step: 4 as Step, labelKey: "launch" as const, icon: Rocket }
                  ] as const
                ).map(({ step: s, labelKey, icon: Icon }) =>
                  canUseAllAdapters ? (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStep(s)}
                      className={s === step ? "onboarding-wizard-tab active" : "onboarding-wizard-tab"}
                    >
                      <Icon aria-hidden />
                      {t(`onboarding:${labelKey}`)}
                    </button>
                  ) : (
                    <span
                      key={s}
                      className={cn(
                        "onboarding-wizard-tab",
                        s === step && "active",
                        "onboarding-wizard-tab-disabled"
                      )}
                      aria-current={s === step ? "step" : undefined}
                    >
                      <Icon aria-hidden />
                      {t(`onboarding:${labelKey}`)}
                    </span>
                  )
                )}
              </div>

              {step === 1 && (
                <div className="onboarding-wizard-step">
                  <div className="onboarding-wizard-step-header">
                    <div className="onboarding-wizard-step-icon">
                      <Building2 aria-hidden />
                    </div>
                    <div>
                      <h3 className="onboarding-wizard-step-title">{t("onboarding:nameYourCompany")}</h3>
                      <p className="onboarding-wizard-step-desc">
                        {t("onboarding:step1Desc")}
                      </p>
                    </div>
                  </div>
                  {!existingCompanyId && (
                    <div className="onboarding-wizard-creation-toggle" role="group" aria-label={t("onboarding:creationModeLabel")}>
                      <button
                        type="button"
                        className={cn(
                          "onboarding-wizard-creation-toggle-btn",
                          creationMode === "blank" && "active",
                        )}
                        onClick={() => {
                          setCreationMode("blank");
                          setTemplateId(null);
                          setError(null);
                        }}
                      >
                        {t("onboarding:creationModeBlank")}
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "onboarding-wizard-creation-toggle-btn",
                          creationMode === "template" && "active",
                        )}
                        onClick={() => {
                          setCreationMode("template");
                          setError(null);
                        }}
                      >
                        {t("onboarding:creationModeTemplate")}
                      </button>
                    </div>
                  )}
                  <div className="onboarding-wizard-field group">
                    <label className={cn("onboarding-wizard-label", companyName.trim() && "filled")}>
                      {t("onboarding:companyName")}
                    </label>
                    <input
                      className="onboarding-wizard-input"
                      placeholder={t("onboarding:companyNamePlaceholder")}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {creationMode === "blank" && (
                    <div className="onboarding-wizard-field group">
                      <label className={cn("onboarding-wizard-label", companyDescription.trim() && "filled")}>
                        {t("onboarding:companyIntroOptional")}
                      </label>
                      <textarea
                        className="onboarding-wizard-textarea"
                        placeholder={t("onboarding:companyIntroPlaceholder")}
                        value={companyDescription}
                        onChange={(e) => setCompanyDescription(e.target.value)}
                      />
                    </div>
                  )}
                  {creationMode === "template" && !existingCompanyId && (
                    <div className="onboarding-wizard-field group">
                      <label className={cn("onboarding-wizard-label", templateId && "filled")}>
                        {t("onboarding:officialTemplate")}
                      </label>
                      <select
                        className="onboarding-wizard-input onboarding-wizard-select"
                        value={templateId ?? ""}
                        onChange={(e) => setTemplateId(e.target.value || null)}
                      >
                        <option value="">{t("onboarding:chooseTemplate")}</option>
                        {(templateCatalog?.templates ?? []).map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {t(entry.nameKey)} — {t(entry.descriptionKey)}
                          </option>
                        ))}
                      </select>
                      <p className="onboarding-wizard-template-hint">{t("onboarding:templateHint")}</p>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && importedFromTemplate && (
                <div className="onboarding-wizard-step">
                  <div className="onboarding-wizard-step-header">
                    <div className="onboarding-wizard-step-icon">
                      <Bot aria-hidden />
                    </div>
                    <div>
                      <h3 className="onboarding-wizard-step-title">{t("onboarding:templateStep2Title")}</h3>
                      <p className="onboarding-wizard-step-desc">
                        {t("onboarding:templateStep2Desc")}
                      </p>
                    </div>
                  </div>
                  <ul className="onboarding-wizard-template-agent-list">
                    {importedAgentNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {step === 2 && !importedFromTemplate && (
                <div className="onboarding-wizard-step">
                  <div className="onboarding-wizard-step-header">
                    <div className="onboarding-wizard-step-icon">
                      <Bot aria-hidden />
                    </div>
                    <div>
                      <h3 className="onboarding-wizard-step-title">{t("onboarding:createFirstAgent")}</h3>
                      <p className="onboarding-wizard-step-desc">
                        {t("onboarding:step2Desc")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="onboarding-wizard-label-block">
                      {t("onboarding:agentName")}
                    </label>
                    <input
                      className="onboarding-wizard-input"
                      placeholder={t("onboarding:agentNamePlaceholder")}
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="onboarding-wizard-label-block mb-2">
                      {t("onboarding:adapterType")}
                    </label>
                    {canUseAllAdapters ? (
                      <>
                        <div className="onboarding-wizard-adapter-grid">
                          {[
                            { value: "claude_local" as const, labelKey: "claudeLocal" as const, descKey: "localClaudeAgent" as const, icon: Sparkles, recommended: true },
                            { value: "claude_remote" as const, labelKey: "claudeRemote" as const, descKey: "apiKeyRequired" as const, icon: Sparkles, recommended: true },
                            { value: "codex_local" as const, labelKey: "codexLocal" as const, descKey: "localCodexAgent" as const, icon: Code, recommended: true },
                            { value: "codex_remote" as const, labelKey: "codexRemote" as const, descKey: "apiKeyRequired" as const, icon: Code, recommended: true },
                            { value: "gemini_local" as const, labelKey: "geminiLocal" as const, descKey: "localGeminiAgent" as const, icon: Gem, recommended: true },
                            { value: "gemini_remote" as const, labelKey: "geminiRemote" as const, descKey: "apiKeyRequired" as const, icon: Gem, recommended: true },
                          ].map((opt) => {
                            const isActive = adapterType === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                className={cn("onboarding-wizard-adapter-card", isActive && "active")}
                                onClick={() => {
                                  setAdapterType(opt.value as AdapterType);
                                  if ((opt.value === "codex_local" || opt.value === "codex_remote") && !model) setModel(DEFAULT_CODEX_LOCAL_MODEL);
                                  else if ((opt.value === "gemini_local" || opt.value === "gemini_remote") && !model) setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                                  else if (opt.value !== "codex_local" && opt.value !== "codex_remote" && opt.value !== "gemini_local" && opt.value !== "gemini_remote") setModel("");
                                }}
                              >
                                {opt.recommended && (
                                  <span className="onboarding-wizard-recommended">{t("onboarding:recommended")}</span>
                                )}
                                <opt.icon aria-hidden />
                                <span className="card-label">{t(`onboarding:${opt.labelKey}`)}</span>
                                <span className="card-desc">{t(`onboarding:${opt.descKey}`)}</span>
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          className="onboarding-wizard-more-adapters"
                          onClick={() => setShowMoreAdapters((v) => !v)}
                        >
                          <ChevronDown className={showMoreAdapters ? "open" : "closed"} aria-hidden />
                          {t("onboarding:moreAdapterTypes")}
                        </button>

                        {showMoreAdapters && (
                          <div className="onboarding-wizard-adapter-grid" style={{ marginTop: "0.5rem" }}>
                            {[
                              { value: "opencode_local" as const, labelKey: "openCode" as const, descKey: "localMultiProviderAgent" as const, icon: OpenCodeLogoIcon },
                              { value: "pi_local" as const, labelKey: "pi" as const, descKey: "localPiAgent" as const, icon: Terminal },
                              { value: "cursor" as const, labelKey: "cursor" as const, descKey: "localCursorAgent" as const, icon: MousePointer2 },
                              {
                                value: "local_self_hosted_llm" as const,
                                labelKey: "localSelfHostedLlm" as const,
                                descKey: "localSelfHostedLlmAgent" as const,
                                icon: Cpu,
                              },
                              { value: "openclaw_gateway" as const, labelKey: "openclawGateway" as const, descKey: "invokeOpenClawViaGateway" as const, icon: Bot, comingSoon: true, disabledLabelKey: "configureOpenClawInApp" as const },
                            ].map((opt) => {
                              const isActive = adapterType === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={!!("comingSoon" in opt && opt.comingSoon)}
                                  className={cn(
                                    "onboarding-wizard-adapter-card",
                                    ("comingSoon" in opt && opt.comingSoon) && "disabled",
                                    isActive && "active"
                                  )}
                                  onClick={() => {
                                    if ("comingSoon" in opt && opt.comingSoon) return;
                                    setAdapterType(opt.value as AdapterType);
                                    if (opt.value === "cursor" && !model) setModel(DEFAULT_CURSOR_LOCAL_MODEL);
                                    else if (opt.value === "opencode_local") { if (!model.includes("/")) setModel(""); }
                                    else if (opt.value === "local_self_hosted_llm") {
                                      setModel("");
                                      setLlmBaseUrl((u) => (u.trim() ? u : defaultCreateValues.baseUrl));
                                    }
                                    else if (opt.value !== "cursor") setModel("");
                                  }}
                                >
                                  <opt.icon aria-hidden />
                                  <span className="card-label">{t(`onboarding:${opt.labelKey}`)}</span>
                                  <span className="card-desc">
                                    {"comingSoon" in opt && opt.comingSoon
                                      ? t(`onboarding:${(opt as { disabledLabelKey?: string }).disabledLabelKey ?? "comingSoon"}`)
                                      : t(`onboarding:${opt.descKey}`)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="onboarding-wizard-adapter-grid">
                        {[
                          { value: "claude_local" as const, labelKey: "claudeLocal" as const, descKey: "localClaudeAgent" as const, icon: Sparkles },
                          { value: "claude_remote" as const, labelKey: "claudeRemote" as const, descKey: "apiKeyRequired" as const, icon: Sparkles },
                          { value: "codex_local" as const, labelKey: "codexLocal" as const, descKey: "localCodexAgent" as const, icon: Code },
                          { value: "codex_remote" as const, labelKey: "codexRemote" as const, descKey: "apiKeyRequired" as const, icon: Code },
                          { value: "gemini_local" as const, labelKey: "geminiLocal" as const, descKey: "localGeminiAgent" as const, icon: Gem },
                          { value: "gemini_remote" as const, labelKey: "geminiRemote" as const, descKey: "apiKeyRequired" as const, icon: Gem },
                        ]
                          .filter((opt) => (allowedAdapterTypes ?? []).includes(opt.value))
                          .map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={adapterType === opt.value ? "onboarding-wizard-adapter-card active" : "onboarding-wizard-adapter-card"}
                              onClick={() => {
                                const nextType = opt.value as AdapterType;
                                setAdapterType(nextType);
                                if ((nextType === "codex_local" || nextType === "codex_remote") && !model) setModel(DEFAULT_CODEX_LOCAL_MODEL);
                                else if ((nextType === "gemini_local" || nextType === "gemini_remote") && !model) setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                                else if (nextType !== "codex_local" && nextType !== "codex_remote" && nextType !== "gemini_local" && nextType !== "gemini_remote") setModel("");
                              }}
                            >
                              <opt.icon aria-hidden />
                              <span className="card-label">{t(`onboarding:${opt.labelKey}`)}</span>
                              <span className="card-desc">{t(`onboarding:${opt.descKey}`)}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* API Key input only when in API Key mode or non-admin (本機不需填寫) */}
                  {requiresApiKey && (
                    <div className="onboarding-wizard-space-y-2">
                      <div className="onboarding-wizard-cwd-label-row">
                        <label className="onboarding-wizard-label-block" htmlFor="onboarding-api-key">
                          {t("onboarding:apiKey")}
                        </label>
                        <HintIcon text={t("onboarding:apiKeyHint")} />
                      </div>
                      <input
                        id="onboarding-api-key"
                        type="password"
                        autoComplete="off"
                        className="onboarding-wizard-input onboarding-wizard-api-key-input"
                        placeholder={t("onboarding:apiKeyPlaceholder")}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        aria-invalid={!!apiKeyValidationError}
                        aria-describedby={apiKeyValidationError ? "onboarding-api-key-error" : undefined}
                      />
                      {apiKeyValidationError && (
                        <p id="onboarding-api-key-error" className="onboarding-wizard-api-key-error" role="alert">
                          {apiKeyValidationError}
                        </p>
                      )}
                      <p className="onboarding-wizard-byok-note">{t("onboarding:byokModelCostNote")}</p>
                      <p className="onboarding-wizard-byok-note">{t("onboarding:secretRefRecommendNote")}</p>
                      <p className="onboarding-wizard-byok-note onboarding-wizard-byok-muted">
                        {t("onboarding:hostedInferenceUpsell")}
                      </p>
                    </div>
                  )}

                  {/* 雲端適配器：測試連線（不消耗 Token） */}
                  {adapterRequiresApiKeyInput(adapterType) && (
                    <div className="onboarding-wizard-env-section onboarding-wizard-space-y-2">
                      <div className="onboarding-wizard-env-section-header">
                        <div>
                          <p className="onboarding-wizard-env-section-title">
                            {t("onboarding:testConnection")}
                          </p>
                          <p className="onboarding-wizard-env-section-desc">
                            {t("onboarding:testConnectionDesc")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="onboarding-wizard-btn-sm"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading ? t("onboarding:testing") : t("onboarding:testNow")}
                        </Button>
                      </div>
                      {adapterEnvError && (
                        <div className="onboarding-wizard-env-box">
                          {adapterEnvError}
                        </div>
                      )}
                      {adapterEnvResult && adapterEnvResult.status === "pass" ? (
                        <div className="onboarding-wizard-env-success">
                          <Check aria-hidden />
                          <span className="onboarding-wizard-font-medium">{t("onboarding:passed")}</span>
                        </div>
                      ) : adapterEnvResult ? (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      ) : null}
                    </div>
                  )}

                  {/* Conditional adapter fields */}
                  {(adapterType === "claude_local" ||
                    adapterType === "claude_remote" ||
                    adapterType === "codex_local" ||
                    adapterType === "codex_remote" ||
                    adapterType === "gemini_local" ||
                    adapterType === "gemini_remote" ||
                    adapterType === "opencode_local" ||
                    adapterType === "pi_local" ||
                    adapterType === "cursor" ||
                    adapterType === "local_self_hosted_llm") && (
                    <div className="onboarding-wizard-space-y-3">
                      {adapterType === "local_self_hosted_llm" && (
                        <div>
                          <label className="onboarding-wizard-label-block">
                            {t("onboarding:localSelfHostedBaseUrl")}
                          </label>
                          <input
                            className="onboarding-wizard-input onboarding-wizard-input-mono"
                            placeholder={t("onboarding:localSelfHostedBaseUrlPlaceholder")}
                            value={llmBaseUrl}
                            onChange={(e) => setLlmBaseUrl(e.target.value)}
                            autoComplete="off"
                          />
                        </div>
                      )}
                      {canSetWorkingDirectory && (
                        <div>
                          <div className="onboarding-wizard-cwd-label-row">
                            <label className="onboarding-wizard-label-block" style={{ marginBottom: 0 }}>
                              {t("onboarding:workingDirectory")}
                            </label>
                            <HintIcon text={t("onboarding:workingDirectoryHint")} />
                          </div>
                          <div className="onboarding-wizard-cwd-wrap">
                            <FolderOpen aria-hidden />
                            <input
                              className="onboarding-wizard-cwd-input"
                              placeholder="/path/to/project"
                              value={cwd}
                              onChange={(e) => setCwd(e.target.value)}
                            />
                            <ChoosePathButton />
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="onboarding-wizard-cwd-label-row">
                          <label className="onboarding-wizard-label-block" style={{ marginBottom: 0 }}>
                            {adapterType === "local_self_hosted_llm"
                              ? t("onboarding:localSelfHostedModel")
                              : t("onboarding:model")}
                          </label>
                          {adapterType === "local_self_hosted_llm" ? (
                            <HintIcon text={t("onboarding:localSelfHostedModelHint")} />
                          ) : null}
                        </div>
                        <Popover
                          open={modelOpen}
                          onOpenChange={(next) => {
                            setModelOpen(next);
                            if (!next) setModelSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button type="button" className="onboarding-wizard-model-trigger">
                              <span className={!model ? "placeholder" : undefined}>
                                {selectedModel
                                  ? selectedModel.label
                                  : model ||
                                    (adapterType === "opencode_local"
                                      ? t("onboarding:selectModelRequired")
                                      : t("onboarding:default"))}
                              </span>
                              <ChevronDown aria-hidden />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="onboarding-wizard-model-popover"
                            align="start"
                          >
                            <input
                              className="onboarding-wizard-input onboarding-wizard-model-search"
                              placeholder={t("onboarding:searchModels")}
                              value={modelSearch}
                              onChange={(e) => setModelSearch(e.target.value)}
                              autoFocus
                            />
                            {adapterType !== "opencode_local" && (
                              <button
                                type="button"
                                className={cn("onboarding-wizard-model-default-btn", !model && "selected")}
                                onClick={() => {
                                  setModel("");
                                  setModelOpen(false);
                                }}
                              >
                                {t("onboarding:default")}
                              </button>
                            )}
                            <div className="onboarding-wizard-model-list">
                              {groupedModels.map((group) => (
                                <div key={group.provider} className="onboarding-wizard-model-group">
                                  {adapterType === "opencode_local" && (
                                    <div className="onboarding-wizard-model-group-label">
                                      {group.provider} ({group.entries.length})
                                    </div>
                                  )}
                                  {group.entries.map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className={cn("onboarding-wizard-model-option", m.id === model && "selected")}
                                      onClick={() => {
                                        setModel(m.id);
                                        setModelOpen(false);
                                      }}
                                    >
                                      <span title={m.id}>
                                        {adapterType === "opencode_local"
                                          ? extractModelName(m.id)
                                          : m.label}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                            {filteredModels.length === 0 && (
                              <p className="onboarding-wizard-model-empty">
                                {t("onboarding:noModelsDiscovered")}
                              </p>
                            )}
                            </PopoverContent>
                        </Popover>
                      </div>
                      {adapterType === "local_self_hosted_llm" && (
                        <div>
                          <div className="onboarding-wizard-cwd-label-row">
                            <label className="onboarding-wizard-label-block" htmlFor="onboarding-local-llm-api-key">
                              {t("onboarding:localSelfHostedApiKey")}
                            </label>
                            <HintIcon text={t("onboarding:localSelfHostedApiKeyHint")} />
                          </div>
                          <input
                            id="onboarding-local-llm-api-key"
                            type="password"
                            autoComplete="off"
                            className="onboarding-wizard-input onboarding-wizard-api-key-input"
                            placeholder={t("common:optional")}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {isLocalAdapter && !adapterRequiresApiKeyInput(adapterType) && (
                    <div className="onboarding-wizard-env-section onboarding-wizard-space-y-2">
                      <div className="onboarding-wizard-env-section-header">
                      <div>
                        <p className="onboarding-wizard-env-section-title">
                            {t("onboarding:adapterEnvCheck")}
                          </p>
                          <p className="onboarding-wizard-env-section-desc">
                            {t("onboarding:adapterEnvCheckDesc")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="onboarding-wizard-btn-sm"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading ? t("onboarding:testing") : t("onboarding:testNow")}
                        </Button>
                      </div>

                      {adapterEnvError && (
                        <div className="onboarding-wizard-env-box">
                          {adapterEnvError}
                        </div>
                      )}

                      {adapterEnvResult && adapterEnvResult.status === "pass" ? (
                        <div className="onboarding-wizard-env-success">
                          <Check aria-hidden />
                          <span className="onboarding-wizard-font-medium">{t("onboarding:passed")}</span>
                        </div>
                      ) : adapterEnvResult ? (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      ) : null}

                      {shouldSuggestUnsetAnthropicApiKey && (
                        <div className="onboarding-wizard-env-warn">
                          <p>
                            {t("onboarding:claudeFailedAnthropicSet")}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="onboarding-wizard-btn-sm"
                            disabled={adapterEnvLoading || unsetAnthropicLoading}
                            onClick={() => void handleUnsetAnthropicApiKey()}
                          >
                            {unsetAnthropicLoading ? t("onboarding:retrying") : t("onboarding:unsetAnthropicApiKey")}
                          </Button>
                        </div>
                      )}

                      {adapterEnvResult && adapterEnvResult.status === "fail" && (
                        <div className="onboarding-wizard-env-debug">
                          <p className="onboarding-wizard-font-medium">{t("onboarding:manualDebug")}</p>
                          <p className="onboarding-wizard-env-debug mono">
                            {adapterType === "local_self_hosted_llm"
                              ? `curl -sS "${(llmBaseUrl.trim() || defaultCreateValues.baseUrl).replace(/\/$/, "")}/models"`
                              : adapterType === "cursor"
                              ? `${effectiveAdapterCommand} -p --mode ask --output-format json \"Respond with hello.\"`
                              : adapterType === "codex_local"
                              ? `${effectiveAdapterCommand} exec --json -`
                              : adapterType === "gemini_local"
                                ? `${effectiveAdapterCommand} --output-format json "Respond with hello."`
                              : adapterType === "opencode_local"
                                ? `${effectiveAdapterCommand} run --format json "Respond with hello."`
                              : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
                          </p>
                          <p className="onboarding-wizard-muted">
                            {adapterType === "local_self_hosted_llm"
                              ? t("onboarding:localSelfHostedEnvFailHint")
                              : t("onboarding:promptRespondHello")}
                          </p>
                          {adapterType === "local_self_hosted_llm" ? null : adapterType === "cursor" ||
                          adapterType === "codex_local" ||
                          adapterType === "codex_remote" ||
                          adapterType === "gemini_local" ||
                          adapterType === "gemini_remote" ||
                          adapterType === "opencode_local" ? (
                            <p className="onboarding-wizard-muted">
                              {t("onboarding:ifAuthFailsSet", {
                                key: adapterType === "cursor"
                                  ? "CURSOR_API_KEY"
                                  : adapterType === "gemini_local"
                                    ? "GEMINI_API_KEY"
                                    : "OPENAI_API_KEY",
                                cmd: adapterType === "cursor"
                                  ? "agent login"
                                  : adapterType === "codex_local"
                                    ? "codex login"
                                    : adapterType === "gemini_local"
                                      ? "gemini auth"
                                      : "opencode auth login",
                              })}
                            </p>
                          ) : (
                            <p className="onboarding-wizard-muted">
                              {t("onboarding:ifLoginRequiredRun")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {adapterType === "process" && (
                    <div className="onboarding-wizard-space-y-3">
                      <div>
                        <label className="onboarding-wizard-label-block">{t("onboarding:command")}</label>
                        <input
                          className="onboarding-wizard-input onboarding-wizard-input-mono"
                          placeholder={t("onboarding:commandPlaceholder")}
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="onboarding-wizard-label-block">{t("onboarding:argsPlaceholder")}</label>
                        <input
                          className="onboarding-wizard-input onboarding-wizard-input-mono"
                          placeholder={t("onboarding:argsPlaceholderExample")}
                          value={args}
                          onChange={(e) => setArgs(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {(adapterType === "http" || adapterType === "openclaw_gateway") && (
                    <div>
                      <label className="onboarding-wizard-label-block">
                        {adapterType === "openclaw_gateway" ? t("onboarding:gatewayUrl") : t("onboarding:webhookUrl")}
                      </label>
                      <input
                        className="onboarding-wizard-input onboarding-wizard-input-mono"
                        placeholder={adapterType === "openclaw_gateway" ? t("onboarding:gatewayUrlPlaceholder") : t("onboarding:webhookUrlPlaceholder")}
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="onboarding-wizard-step">
                  <div className="onboarding-wizard-step-header">
                    <div className="onboarding-wizard-step-icon">
                      <ListTodo aria-hidden />
                    </div>
                    <div>
                      <h3 className="onboarding-wizard-step-title">{t("onboarding:giveItSomethingToDo")}</h3>
                      <p className="onboarding-wizard-step-desc">
                        {t("onboarding:step3Desc")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="onboarding-wizard-label-block">
                      {t("onboarding:taskTitle")}
                    </label>
                    <input
                      className="onboarding-wizard-input"
                      placeholder={t("onboarding:taskTitlePlaceholder")}
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="onboarding-wizard-label-block">
                      {t("onboarding:descriptionOptional")}
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="onboarding-wizard-textarea large"
                      placeholder={t("onboarding:descriptionPlaceholder")}
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="onboarding-wizard-step">
                  <div className="onboarding-wizard-step-header">
                    <div className="onboarding-wizard-step-icon">
                      <Rocket aria-hidden />
                    </div>
                    <div>
                      <h3 className="onboarding-wizard-step-title">{t("onboarding:readyToLaunch")}</h3>
                      <p className="onboarding-wizard-step-desc">
                        {t("onboarding:step4Desc")}
                      </p>
                    </div>
                  </div>
                  <div className="onboarding-wizard-summary">
                    <div className="onboarding-wizard-summary-row">
                      <Building2 aria-hidden />
                      <div className="onboarding-wizard-summary-body">
                        <p className="onboarding-wizard-summary-title">{companyName}</p>
                        <p className="onboarding-wizard-summary-caption">{t("onboarding:company")}</p>
                      </div>
                      <Check aria-hidden />
                    </div>
                    <div className="onboarding-wizard-summary-row">
                      <Bot aria-hidden />
                      <div className="onboarding-wizard-summary-body">
                        <p className="onboarding-wizard-summary-title">
                          {importedFromTemplate
                            ? importedAgentNames.join(", ")
                            : agentName}
                        </p>
                        <p className="onboarding-wizard-summary-caption">
                          {importedFromTemplate
                            ? t("onboarding:templateAgentsCaption")
                            : t(`adapter:${adapterType}`)}
                        </p>
                      </div>
                      <Check aria-hidden />
                    </div>
                    <div className="onboarding-wizard-summary-row">
                      <ListTodo aria-hidden />
                      <div className="onboarding-wizard-summary-body">
                        <p className="onboarding-wizard-summary-title">{taskTitle}</p>
                        <p className="onboarding-wizard-summary-caption">{t("onboarding:task")}</p>
                      </div>
                      <Check aria-hidden />
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="onboarding-wizard-error">
                  <p>{error}</p>
                </div>
              )}

              <div className="onboarding-wizard-footer">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="onboarding-wizard-footer-icon" aria-hidden />
                      {t("onboarding:back")}
                    </Button>
                  )}
                </div>
                <div className="onboarding-wizard-footer-actions">
                  {step === 1 && creationMode === "blank" && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                    >
                      {loading ? (
                        <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      )}
                      {loading ? t("onboarding:creating") : t("onboarding:next")}
                    </Button>
                  )}
                  {step === 1 && creationMode === "template" && !existingCompanyId && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || !templateId || loading}
                      onClick={() => void handleTemplatePreviewAndOpenDialog()}
                    >
                      {loading ? (
                        <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      )}
                      {loading ? t("onboarding:previewing") : t("onboarding:previewImport")}
                    </Button>
                  )}
                  {step === 2 && importedFromTemplate && (
                    <Button size="sm" disabled={loading} onClick={() => setStep(3)}>
                      <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      {t("onboarding:next")}
                    </Button>
                  )}
                  {step === 2 && !importedFromTemplate && (
                    <Button
                      size="sm"
                      disabled={
                        !agentName.trim() ||
                        !canProceedStep2 ||
                        loading ||
                        adapterEnvLoading ||
                        (adapterRequiresApiKeyInput(adapterType) && adapterEnvResult?.status !== "pass")
                      }
                      onClick={handleStep2Next}
                    >
                      {loading ? (
                        <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      )}
                      {loading ? t("onboarding:creating") : t("onboarding:next")}
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      )}
                      {loading ? t("onboarding:creating") : t("onboarding:next")}
                    </Button>
                  )}
                  {step === 4 && (
                    <Button size="sm" disabled={loading} onClick={handleLaunch}>
                      {loading ? (
                        <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
                      ) : (
                        <ArrowRight className="onboarding-wizard-footer-icon" aria-hidden />
                      )}
                      {loading ? t("onboarding:opening") : t("onboarding:openIssue")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={cn("onboarding-wizard-visual", step === 1 && "step-1")}>
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>

    <Dialog
      open={templateImportDialogOpen}
      onOpenChange={(open) => {
        if (!open) setTemplateImportDialogOpen(false);
      }}
    >
      <DialogContent className="onboarding-wizard-template-dialog">
        <DialogHeader>
          <DialogTitle>{t("onboarding:templatePreviewTitle")}</DialogTitle>
          <DialogDescription>{t("onboarding:templatePreviewDesc")}</DialogDescription>
        </DialogHeader>
        {templatePreview && (
          <div className="onboarding-wizard-template-preview-body">
            <div className="onboarding-wizard-field group">
              <label className="onboarding-wizard-label">{t("onboarding:collisionStrategy")}</label>
              <select
                className="onboarding-wizard-input onboarding-wizard-select"
                value={templateCollisionStrategy}
                onChange={(e) =>
                  void handleTemplateCollisionChange(
                    e.target.value as CompanyPortabilityCollisionStrategy,
                  )
                }
              >
                <option value="rename">{t("onboarding:collisionRename")}</option>
                <option value="skip">{t("onboarding:collisionSkip")}</option>
                <option value="replace">{t("onboarding:collisionReplace")}</option>
              </select>
            </div>
            {templatePreview.errors.length > 0 && (
              <ul className="onboarding-wizard-template-errors">
                {templatePreview.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
            {templatePreview.warnings.length > 0 && (
              <ul className="onboarding-wizard-template-warnings">
                {templatePreview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <ul className="onboarding-wizard-template-plans">
              {templatePreview.plan.agentPlans.map((p) => (
                <li key={`${p.slug}-${p.action}`}>
                  <span className="onboarding-wizard-plan-slug">{p.slug}</span>
                  <span className="onboarding-wizard-plan-action">{p.action}</span>
                  <span className="onboarding-wizard-plan-name">{p.plannedName}</span>
                </li>
              ))}
            </ul>
            {templatePreview.requiredSecrets.length > 0 && (
              <p className="onboarding-wizard-template-secrets-hint">
                {t("onboarding:templateRequiredSecretsHint")}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setTemplateImportDialogOpen(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            type="button"
            disabled={
              loading ||
              !templatePreview ||
              templatePreview.errors.length > 0
            }
            onClick={() => void handleConfirmTemplateImport()}
          >
            {loading ? (
              <Loader2 className="onboarding-wizard-footer-icon onboarding-wizard-footer-icon-spin" aria-hidden />
            ) : null}
            {t("onboarding:confirmImport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function AdapterEnvironmentResult({
  result
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const { t } = useTranslation("onboarding");
  const statusLabel =
    result.status === "pass" ? t("passed") : result.status === "warn" ? t("warnings") : t("failed");

  return (
    <div className={cn("onboarding-wizard-adapter-result", result.status)}>
      <div className="onboarding-wizard-adapter-result-header">
        <span className="onboarding-wizard-font-medium">{statusLabel}</span>
        <span>{new Date(result.testedAt).toLocaleTimeString()}</span>
      </div>
      <div className="onboarding-wizard-adapter-result-checks">
        {result.checks.map((check, idx) => (
          <div key={`${check.code}-${idx}`} className="onboarding-wizard-adapter-result-check">
            <span className="level">{check.level}</span>
            <span className="dot">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="detail">({check.detail})</span>
            )}
            {check.hint && (
              <span className="hint">{t("hint")}: {check.hint}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
