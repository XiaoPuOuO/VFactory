import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { meApi } from "../api/me";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, Check } from "lucide-react";
import { FolderOpen } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import { IconSettingDialog } from "../components/IconSettingDialog";
import { ChoosePathButton } from "../components/PathInstructionsModal";
import {
  Field,
  ToggleField,
  HintIcon
} from "../components/agent-config-primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "./CompanySettings.css";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

export function CompanySettings() {
  const { t } = useTranslation(["company", "common"]);
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const { data: meProfile } = useQuery({ queryKey: ["me"], queryFn: () => meApi.get(), retry: false });
  const canSetWorkingDirectory = meProfile?.group === "admin";

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setWorkingDirectory(selectedCompany.workingDirectory ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? "") ||
      (canSetWorkingDirectory && workingDirectory !== (selectedCompany.workingDirectory ?? "")));

  const [showMoveWorkingDirDialog, setShowMoveWorkingDirDialog] = useState(false);
  const [showIconDialog, setShowIconDialog] = useState(false);

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
      workingDirectory: string | null;
      moveWorkingDirectory?: boolean;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const iconMutation = useMutation({
    mutationFn: (iconAssetId: string | null) =>
      companiesApi.update(selectedCompanyId!, { iconAssetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : t("failedToCreateInvite")
      );
    }
  });

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);
  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("company"), href: "/dashboard" },
      { label: t("settings") }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  if (!selectedCompany) {
    return (
      <div className="company-settings-no-company">
        {t("noCompanySelected")}
      </div>
    );
  }

  function getGeneralPayload(moveWorkingDirectory?: boolean) {
    return {
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null,
      workingDirectory: canSetWorkingDirectory
        ? workingDirectory.trim() || null
        : (selectedCompany?.workingDirectory ?? null),
      ...(moveWorkingDirectory !== undefined && { moveWorkingDirectory }),
    };
  }

  function handleSaveGeneral() {
    const newWd = workingDirectory.trim() || null;
    const oldWd = selectedCompany?.workingDirectory?.trim() || null;
    const workingDirChanged = newWd !== oldWd && (oldWd != null && oldWd !== "");
    if (workingDirChanged) {
      setShowMoveWorkingDirDialog(true);
      return;
    }
    generalMutation.mutate(getGeneralPayload());
  }

  function handleConfirmMoveWorkingDir(move: boolean) {
    setShowMoveWorkingDirDialog(false);
    generalMutation.mutate(getGeneralPayload(move));
  }

  return (
    <div className="company-settings-page">
      <div className="company-settings-header">
        <Settings />
        <h1 className="company-settings-title">{t("companySettings")}</h1>
      </div>

      {/* General */}
      <div className="company-settings-section">
        <div className="company-settings-section-label">
          {t("sectionGeneral")}
        </div>
        <div className="company-settings-block">
          <Field label={t("companyName")} hint={t("companyNameHint")}>
            <input
              className="company-settings-input"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field label={t("description")} hint={t("descriptionHint")}>
            <input
              className="company-settings-input"
              type="text"
              value={description}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {canSetWorkingDirectory ? (
            <Field
              label={t("agentWorkingDirectory")}
              hint={t("agentWorkingDirectoryHint")}
            >
              <div className="company-settings-working-dir-row">
                <FolderOpen />
                <input
                  className="company-settings-working-dir-input"
                  type="text"
                  value={workingDirectory}
                  placeholder={t("workingDirectoryPlaceholder")}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                />
                <ChoosePathButton />
              </div>
            </Field>
          ) : (
            selectedCompany?.effectiveWorkingDirectory
              ? (
                <Field label={t("agentWorkingDirectory")} hint={t("workingDirectoryAdminOnly")}>
                  <div className="company-settings-working-dir-row company-settings-working-dir-readonly">
                    <FolderOpen />
                    <span className="company-settings-working-dir-value">
                      {selectedCompany.effectiveWorkingDirectory}
                    </span>
                  </div>
                </Field>
                )
              : null
          )}
        </div>
      </div>

      <Dialog open={showMoveWorkingDirDialog} onOpenChange={setShowMoveWorkingDirDialog}>
        <DialogContent showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>{t("agentWorkingDirectoryChanged")}</DialogTitle>
            <DialogDescription>
              {t("workingDirDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton={false}>
            <Button variant="outline" onClick={() => handleConfirmMoveWorkingDir(false)}>
              {t("updatePathOnly")}
            </Button>
            <Button onClick={() => handleConfirmMoveWorkingDir(true)}>
              {t("moveAndSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appearance */}
      <div className="company-settings-section">
        <div className="company-settings-section-label">
          {t("sectionAppearance")}
        </div>
        <div className="company-settings-block">
          <div className="company-settings-appearance-row">
            <button
              type="button"
              onClick={() => setShowIconDialog(true)}
              className="company-settings-icon-btn"
              aria-label={t("iconSettingTitle")}
            >
              {selectedCompany.iconContentPath ? (
                <img
                  src={selectedCompany.iconContentPath}
                  alt=""
                />
              ) : (
                <CompanyPatternIcon
                  companyName={companyName || selectedCompany.name}
                  brandColor={brandColor || null}
                  className="company-settings-icon-pattern"
                />
              )}
            </button>
            <div className="company-settings-appearance-body">
              <Field label={t("brandColor")} hint={t("brandColorHint")}>
                <div className="company-settings-color-row">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="company-settings-color-picker"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder={t("auto")}
                    className="company-settings-color-text"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="company-settings-clear-btn"
                    >
                      {t("clear")}
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="company-settings-save-row">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? t("saving") : t("saveChanges")}
          </Button>
          {generalMutation.isSuccess && (
            <span className="company-settings-save-msg">{t("saved")}</span>
          )}
          {generalMutation.isError && (
            <span className="company-settings-save-error">
              {generalMutation.error instanceof Error
                ? generalMutation.error.message
                : t("saveFailed")}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="company-settings-section">
        <div className="company-settings-section-label">
          {t("sectionHiring")}
        </div>
        <div className="company-settings-block">
          <ToggleField
            label={t("requireApprovalForNewHires")}
            hint={t("requireApprovalHint")}
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
          />
        </div>
      </div>

      {/* Invites */}
      <div className="company-settings-section">
        <div className="company-settings-section-label">
          {t("sectionInvites")}
        </div>
        <div className="company-settings-block">
          <div className="company-settings-invite-desc-row">
            <span className="company-settings-invite-desc">
              {t("generateOpenClawInviteDesc")}
            </span>
            <HintIcon text={t("openClawInviteHintIcon")} />
          </div>
          <div className="company-settings-invite-buttons">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? t("generating")
                : t("generateOpenClawInvite")}
            </Button>
          </div>
          {inviteError && (
            <p className="company-settings-invite-error">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div className="company-settings-snippet-box">
              <div className="company-settings-snippet-header">
                <div className="company-settings-snippet-title">
                  {t("openClawInvitePromptTitle")}
                </div>
                {snippetCopied && (
                  <span key={snippetCopyDelightId} className="company-settings-snippet-copied">
                    <Check />
                    {t("common:copied")}
                  </span>
                )}
              </div>
              <div className="company-settings-snippet-body">
                <textarea
                  className="company-settings-snippet-textarea"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="company-settings-snippet-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? t("copiedSnippet") : t("copySnippet")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <IconSettingDialog
        open={showIconDialog}
        onOpenChange={setShowIconDialog}
        mode="company"
        companyId={selectedCompanyId!}
        currentIconUrl={selectedCompany.iconContentPath ?? null}
        onSaveIcon={async (assetId) => {
          await iconMutation.mutateAsync(assetId);
        }}
        busy={iconMutation.isPending}
      />

      {/* Danger Zone */}
      <div className="company-settings-section">
        <div className="company-settings-section-label danger">
          {t("sectionDangerZone")}
        </div>
        <div className="company-settings-block danger">
          <p className="company-settings-danger-desc">
            {t("archiveWarning")}
          </p>
          <div className="company-settings-danger-actions">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  t("archiveConfirm", { name: selectedCompany.name })
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? t("archiving")
                : selectedCompany.status === "archived"
                ? t("alreadyArchived")
                : t("archiveCompany")}
            </Button>
            {archiveMutation.isError && (
              <span className="company-settings-danger-error">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : t("archiveFailed")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in VFactory, then retry.
Suggested steps:
- choose a hostname that resolves to the VFactory host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart VFactory
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in VFactory, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test VFactory-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from VFactory. Test it. `
    : "";

  return `You're invited to join a VFactory organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than VFactory, VFactory must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that VFactory can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, VFactory will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to VFactory (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
