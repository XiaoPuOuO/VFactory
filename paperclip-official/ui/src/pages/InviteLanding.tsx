import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@/lib/router";
import "./InviteLanding.css";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { AGENT_ADAPTER_TYPES } from "@paperclipai/shared";
import type { AgentAdapterType, JoinRequest } from "@paperclipai/shared";

type JoinType = "human" | "agent";
const joinAdapterOptions: AgentAdapterType[] = [...AGENT_ADAPTER_TYPES];

const adapterLabels: Record<string, string> = {
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

const ENABLED_INVITE_ADAPTERS = new Set([
  "claude_local",
  "claude_remote",
  "codex_local",
  "codex_remote",
  "gemini_local",
  "gemini_remote",
  "opencode_local",
  "cursor",
]);

function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

export function InviteLandingPage() {
  const queryClient = useQueryClient();
  const params = useParams();
  const token = (params.token ?? "").trim();
  const [joinType, setJoinType] = useState<JoinType>("human");
  const [agentName, setAgentName] = useState("");
  const [adapterType, setAdapterType] = useState<AgentAdapterType>("claude_local");
  const [capabilities, setCapabilities] = useState("");
  const [result, setResult] = useState<{ kind: "bootstrap" | "join"; payload: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });
  const inviteQuery = useQuery({
    queryKey: queryKeys.access.invite(token),
    queryFn: () => accessApi.getInvite(token),
    enabled: token.length > 0,
    retry: false,
  });
  /** 邀請頁不依權限過濾（使用者尚未加入公司）；顯示所有啟用的 adapter，後端在建立 agent 時再檢查權限。 */
  const inviteAdapterOptions = joinAdapterOptions.filter((t) => ENABLED_INVITE_ADAPTERS.has(t));

  const invite = inviteQuery.data;
  const allowedJoinTypes = invite?.allowedJoinTypes ?? "both";
  const availableJoinTypes = useMemo(() => {
    if (invite?.inviteType === "bootstrap_ceo") return ["human"] as JoinType[];
    if (allowedJoinTypes === "both") return ["human", "agent"] as JoinType[];
    return [allowedJoinTypes] as JoinType[];
  }, [invite?.inviteType, allowedJoinTypes]);

  useEffect(() => {
    if (!availableJoinTypes.includes(joinType)) {
      setJoinType(availableJoinTypes[0] ?? "human");
    }
  }, [availableJoinTypes, joinType]);

  useEffect(() => {
    if (joinType === "agent" && adapterType && !inviteAdapterOptions.includes(adapterType)) {
      setAdapterType(inviteAdapterOptions[0] ?? "claude_remote");
    }
  }, [joinType, adapterType, inviteAdapterOptions]);

  const requiresAuthForHuman =
    joinType === "human" &&
    healthQuery.data?.deploymentMode === "authenticated" &&
    !sessionQuery.data;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!invite) throw new Error("Invite not found");
      if (invite.inviteType === "bootstrap_ceo") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      if (joinType === "human") {
        return accessApi.acceptInvite(token, { requestType: "human" });
      }
      return accessApi.acceptInvite(token, {
        requestType: "agent",
        agentName: agentName.trim(),
        adapterType,
        capabilities: capabilities.trim() || null,
      });
    },
    onSuccess: async (payload) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      const asBootstrap =
        payload && typeof payload === "object" && "bootstrapAccepted" in (payload as Record<string, unknown>);
      setResult({ kind: asBootstrap ? "bootstrap" : "join", payload });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    },
  });

  if (!token) {
    return (
      <div className="invite-landing-root invite-landing-message error">Invalid invite token.</div>
    );
  }

  if (inviteQuery.isLoading || healthQuery.isLoading || sessionQuery.isLoading) {
    return (
      <div className="invite-landing-root invite-landing-message muted">Loading invite...</div>
    );
  }

  if (inviteQuery.error || !invite) {
    return (
      <div className="invite-landing-root">
        <div className="invite-landing-card">
          <h1>Invite not available</h1>
          <p className="invite-landing-card-desc">
            This invite may be expired, revoked, or already used.
          </p>
        </div>
      </div>
    );
  }

  if (result?.kind === "bootstrap") {
    return (
      <div className="invite-landing-root">
        <div className="invite-landing-card">
          <h1>Bootstrap complete</h1>
          <p className="invite-landing-card-desc">
            The first instance admin is now configured. You can continue to the board.
          </p>
          <Button asChild className="invite-landing-card-actions">
            <Link to="/">Open board</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (result?.kind === "join") {
    const payload = result.payload as JoinRequest & {
      claimSecret?: string;
      claimApiKeyPath?: string;
      onboarding?: Record<string, unknown>;
      diagnostics?: Array<{
        code: string;
        level: "info" | "warn";
        message: string;
        hint?: string;
      }>;
    };
    const claimSecret = typeof payload.claimSecret === "string" ? payload.claimSecret : null;
    const claimApiKeyPath = typeof payload.claimApiKeyPath === "string" ? payload.claimApiKeyPath : null;
    const onboardingSkillUrl = readNestedString(payload.onboarding, ["skill", "url"]);
    const onboardingSkillPath = readNestedString(payload.onboarding, ["skill", "path"]);
    const onboardingInstallPath = readNestedString(payload.onboarding, ["skill", "installPath"]);
    const onboardingTextUrl = readNestedString(payload.onboarding, ["textInstructions", "url"]);
    const onboardingTextPath = readNestedString(payload.onboarding, ["textInstructions", "path"]);
    const diagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    return (
      <div className="invite-landing-root">
        <div className="invite-landing-card">
          <h1>Join request submitted</h1>
          <p className="invite-landing-card-desc">
            Your request is pending admin approval. You will not have access until approved.
          </p>
          <div className="invite-landing-block">
            Request ID: <span className="invite-landing-mono">{payload.id}</span>
          </div>
          {claimSecret && claimApiKeyPath && (
            <div className="invite-landing-block">
              <p className="invite-landing-block-title">One-time claim secret (save now)</p>
              <p className="invite-landing-mono invite-landing-break">{claimSecret}</p>
              <p className="invite-landing-mono invite-landing-break">POST {claimApiKeyPath}</p>
            </div>
          )}
          {(onboardingSkillUrl || onboardingSkillPath || onboardingInstallPath) && (
            <div className="invite-landing-block">
              <p className="invite-landing-block-title">VFactory skill bootstrap</p>
              {onboardingSkillUrl && <p className="invite-landing-mono invite-landing-break">GET {onboardingSkillUrl}</p>}
              {!onboardingSkillUrl && onboardingSkillPath && <p className="invite-landing-mono invite-landing-break">GET {onboardingSkillPath}</p>}
              {onboardingInstallPath && <p className="invite-landing-mono invite-landing-break">Install to {onboardingInstallPath}</p>}
            </div>
          )}
          {(onboardingTextUrl || onboardingTextPath) && (
            <div className="invite-landing-block">
              <p className="invite-landing-block-title">Agent-readable onboarding text</p>
              {onboardingTextUrl && <p className="invite-landing-mono invite-landing-break">GET {onboardingTextUrl}</p>}
              {!onboardingTextUrl && onboardingTextPath && <p className="invite-landing-mono invite-landing-break">GET {onboardingTextPath}</p>}
            </div>
          )}
          {diagnostics.length > 0 && (
            <div className="invite-landing-block">
              <p className="invite-landing-block-title">Connectivity diagnostics</p>
              {diagnostics.map((diag, idx) => (
                <div key={`${diag.code}:${idx}`} className="invite-landing-diag-item" data-level={diag.level}>
                  <p>[{diag.level}] {diag.message}</p>
                  {diag.hint && <p className="invite-landing-mono invite-landing-break">{diag.hint}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="invite-landing-root">
      <div className="invite-landing-card">
        <h1 className="large">
          {invite.inviteType === "bootstrap_ceo" ? "Bootstrap your VFactory instance" : "Join this VFactory company"}
        </h1>
        <p className="invite-landing-card-desc">Invite expires {dateTime(invite.expiresAt)}.</p>

        {invite.inviteType !== "bootstrap_ceo" && (
          <div className="invite-landing-join-tabs">
            {availableJoinTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setJoinType(type)}
                className={joinType === type ? "invite-landing-join-tab active" : "invite-landing-join-tab"}
              >
                Join as {type}
              </button>
            ))}
          </div>
        )}

        {joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && (
          <div className="invite-landing-form">
            <label className="invite-landing-label">
              <span className="invite-landing-label-caption">Agent name</span>
              <input
                className="invite-landing-input"
                value={agentName}
                onChange={(event) => setAgentName(event.target.value)}
              />
            </label>
            <label className="invite-landing-label">
              <span className="invite-landing-label-caption">Adapter type</span>
              <select
                className="invite-landing-input"
                value={adapterType}
                onChange={(event) => setAdapterType(event.target.value as AgentAdapterType)}
              >
                {inviteAdapterOptions.map((type) => (
                  <option key={type} value={type} disabled={!ENABLED_INVITE_ADAPTERS.has(type)}>
                    {adapterLabels[type]}{!ENABLED_INVITE_ADAPTERS.has(type) ? " (Coming soon)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="invite-landing-label">
              <span className="invite-landing-label-caption">Capabilities (optional)</span>
              <textarea
                className="invite-landing-input"
                rows={4}
                value={capabilities}
                onChange={(event) => setCapabilities(event.target.value)}
              />
            </label>
          </div>
        )}

        {requiresAuthForHuman && (
          <div className="invite-landing-auth-note">
            Sign in or create an account before submitting a human join request.
            <div className="invite-landing-auth-note-actions">
              <Button asChild size="sm" variant="outline">
                <Link to={`/auth?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in / Create account</Link>
              </Button>
            </div>
          </div>
        )}

        {error && <p className="invite-landing-error">{error}</p>}

        <Button
          className="invite-landing-submit"
          disabled={
            acceptMutation.isPending ||
            (joinType === "agent" && invite.inviteType !== "bootstrap_ceo" && agentName.trim().length === 0) ||
            requiresAuthForHuman
          }
          onClick={() => acceptMutation.mutate()}
        >
          {acceptMutation.isPending
            ? "Submitting…"
            : invite.inviteType === "bootstrap_ceo"
              ? "Accept bootstrap invite"
              : "Submit join request"}
        </Button>
      </div>
    </div>
  );
}
