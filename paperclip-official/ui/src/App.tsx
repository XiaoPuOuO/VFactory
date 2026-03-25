import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "@/lib/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Layout } from "./components/Layout";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { authApi } from "./api/auth";
import { healthApi } from "./api/health";
import { Dashboard } from "./pages/Dashboard";
import { Companies } from "./pages/Companies";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Issues } from "./pages/Issues";
import { IssueDetail } from "./pages/IssueDetail";
import { Goals } from "./pages/Goals";
import { GoalDetail } from "./pages/GoalDetail";
import { Schedules } from "./pages/Schedules";
import { RunQuality } from "./pages/RunQuality";
import { Approvals } from "./pages/Approvals";
import { ApprovalDetail } from "./pages/ApprovalDetail";
import { Costs } from "./pages/Costs";
import { Governance } from "./pages/Governance";
import { Activity } from "./pages/Activity";
import { Inbox } from "./pages/Inbox";
import { Chat } from "./pages/Chat";
import { ChatEmpty } from "./pages/ChatEmpty";
import { ChatRoom } from "./pages/ChatRoom";
import { CompanySettings } from "./pages/CompanySettings";
import { CompanyAutomation } from "./pages/CompanyAutomation";
import { Account } from "./pages/Account";
import { DesignGuide } from "./pages/DesignGuide";
import { InstanceSettings } from "./pages/InstanceSettings";
import { DefaultCompanyPathSettings } from "./pages/DefaultCompanyPathSettings";
import { ComplianceRetentionSettings } from "./pages/ComplianceRetentionSettings";
import { ArchiveCompanySettings } from "./pages/ArchiveCompanySettings";
import { InstanceCompanyManagement } from "./pages/InstanceCompanyManagement";
import { InstanceGroupManagement } from "./pages/InstanceGroupManagement";
import { InstanceUserManagement } from "./pages/InstanceUserManagement";
import { RunTranscriptUxLab } from "./pages/RunTranscriptUxLab";
import { OrgChart } from "./pages/OrgChart";
import { GoalMap } from "./pages/GoalMap";
import { NewAgent } from "./pages/NewAgent";
import { AuthPage } from "./pages/Auth";
import { BoardClaimPage } from "./pages/BoardClaim";
import { InviteLandingPage } from "./pages/InviteLanding";
import { Landing } from "./pages/Landing";
import { TenantSelectPage } from "./pages/TenantSelect";
import { NotFoundPage } from "./pages/NotFound";
import { queryKeys } from "./lib/queryKeys";
import { getTenantSlug } from "./api/client";
import { useCompany } from "./context/CompanyContext";
import { useDialog } from "./context/DialogContext";
import { loadLastInboxTab } from "./lib/inbox";

/** 閘道頁（無公司前導等）提供帳號與登出，避免使用者困在單一 CTA。 */
function AppGateSessionActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="app-gate-session" role="navigation" aria-label={t("app.gateSessionNavLabel")}>
      <button
        type="button"
        className="app-gate-session-signout app-gate-session-signout--solo"
        disabled={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await authApi.signOut();
            await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
            navigate("/landing", { replace: true });
          } finally {
            setSigningOut(false);
          }
        }}
      >
        <LogOut className="app-gate-session-icon" aria-hidden />
        {signingOut ? t("account.signingOut") : t("account.signOut")}
      </button>
    </div>
  );
}

function BootstrapPendingPage({ hasActiveInvite = false }: { hasActiveInvite?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="app-gate-wrap">
      <div className="app-gate-card">
        <h1 className="app-gate-title">{t("app.instanceSetupRequired")}</h1>
        <p className="app-gate-desc">
          {hasActiveInvite ? t("app.bootstrapPendingHasInvite") : t("app.bootstrapPendingNoInvite")}
        </p>
        <pre className="app-gate-pre">
{`pnpm paperclipai auth bootstrap-ceo`}
        </pre>
      </div>
    </div>
  );
}

function CloudAccessGate() {
  const { t } = useTranslation();
  const location = useLocation();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const deploymentMode = healthQuery.data?.deploymentMode;
  const isAuthenticatedMode = deploymentMode === "authenticated";
  const requireLogin = deploymentMode === "authenticated";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: requireLogin,
    retry: false,
  });

  if (healthQuery.isLoading || (requireLogin && sessionQuery.isLoading)) {
    return <div className="app-gate-wrap app-gate-message">{t("app.loading")}</div>;
  }

  if (healthQuery.error) {
    return (
      <div className="app-gate-wrap app-gate-error">
        {healthQuery.error instanceof Error ? healthQuery.error.message : t("app.failedToLoadAppState")}
      </div>
    );
  }

  if (isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending") {
    return <BootstrapPendingPage hasActiveInvite={healthQuery.data.bootstrapInviteActive} />;
  }

  const sessionData = sessionQuery.data;
  const isBanned =
    sessionData &&
    typeof sessionData === "object" &&
    "banned" in sessionData &&
    (sessionData as { banned: boolean }).banned === true;
  const hasValidSession =
    sessionData &&
    typeof sessionData === "object" &&
    "session" in sessionData &&
    typeof (sessionData as { session: unknown }).session === "object";

  if (requireLogin && isBanned) {
    return (
      <AccountBannedPage
        reason={(sessionData as { reason: string }).reason ?? ""}
        bannedUntil={(sessionData as { bannedUntil: string | null }).bannedUntil ?? null}
      />
    );
  }

  if (requireLogin && !hasValidSession) {
    return <Navigate to="/landing" replace />;
  }

  return <Outlet />;
}

function AccountBannedPage({ reason, bannedUntil }: { reason: string; bannedUntil: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="app-gate-wrap">
      <div className="app-gate-card">
        <h1 className="app-gate-title">{t("instance.accountBannedTitle")}</h1>
        <p className="app-gate-desc">{t("instance.accountBannedMessage")}</p>
        {reason && (
          <div className="app-gate-banned-reason">
            <strong>{t("instance.banReason")}:</strong> {reason}
          </div>
        )}
        {bannedUntil && (
          <p className="app-gate-desc">
            {t("instance.banDuration")}: {new Date(bannedUntil).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}

function boardRoutes() {
  return (
    <>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="onboarding" element={<OnboardingRoutePage />} />
      <Route path="companies" element={<Companies />} />
      <Route path="company/settings" element={<CompanySettings />} />
      <Route path="company/automation" element={<CompanyAutomation />} />
      <Route path="settings" element={<LegacySettingsRedirect />} />
      <Route path="settings/*" element={<LegacySettingsRedirect />} />
      <Route path="org" element={<OrgChart />} />
      <Route path="goal-map" element={<GoalMap />} />
      <Route path="agents" element={<Navigate to="/agents/all" replace />} />
      <Route path="agents/all" element={<Agents />} />
      <Route path="agents/active" element={<Agents />} />
      <Route path="agents/paused" element={<Agents />} />
      <Route path="agents/error" element={<Agents />} />
      <Route path="agents/new" element={<NewAgent />} />
      <Route path="agents/:agentId" element={<AgentDetail />} />
      <Route path="agents/:agentId/:tab" element={<AgentDetail />} />
      <Route path="agents/:agentId/runs/:runId" element={<AgentDetail />} />
      <Route path="projects" element={<Projects />} />
      <Route path="projects/:projectId" element={<ProjectDetail />} />
      <Route path="projects/:projectId/overview" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues" element={<ProjectDetail />} />
      <Route path="projects/:projectId/issues/:filter" element={<ProjectDetail />} />
      <Route path="projects/:projectId/configuration" element={<ProjectDetail />} />
      <Route path="issues" element={<Issues />} />
      <Route path="issues/all" element={<Navigate to="/issues" replace />} />
      <Route path="issues/active" element={<Navigate to="/issues" replace />} />
      <Route path="issues/backlog" element={<Navigate to="/issues" replace />} />
      <Route path="issues/done" element={<Navigate to="/issues" replace />} />
      <Route path="issues/recent" element={<Navigate to="/issues" replace />} />
      <Route path="issues/:issueId" element={<IssueDetail />} />
      <Route path="goals" element={<Goals />} />
      <Route path="goals/:goalId" element={<GoalDetail />} />
      <Route path="schedules" element={<Schedules />} />
      <Route path="runs" element={<RunQuality />} />
      <Route path="approvals" element={<Navigate to="/approvals/pending" replace />} />
      <Route path="approvals/pending" element={<Approvals />} />
      <Route path="approvals/all" element={<Approvals />} />
      <Route path="approvals/:approvalId" element={<ApprovalDetail />} />
      <Route path="costs" element={<Costs />} />
      <Route path="governance" element={<Governance />} />
      <Route path="activity" element={<Activity />} />
      <Route path="inbox" element={<InboxRootRedirect />} />
      <Route path="inbox/recent" element={<Inbox />} />
      <Route path="inbox/unread" element={<Inbox />} />
      <Route path="inbox/all" element={<Inbox />} />
      <Route path="inbox/new" element={<Navigate to="/inbox/recent" replace />} />
      <Route path="chat" element={<Chat />}>
        <Route index element={<ChatEmpty />} />
        <Route path=":roomId" element={<ChatRoom />} />
      </Route>
      <Route path="account" element={<Account />} />
      <Route path="design-guide" element={<DesignGuide />} />
      <Route path="tests/ux/runs" element={<RunTranscriptUxLab />} />
      <Route path="*" element={<NotFoundPage scope="board" />} />
    </>
  );
}

function InboxRootRedirect() {
  return <Navigate to={`/inbox/${loadLastInboxTab()}`} replace />;
}

function LegacySettingsRedirect() {
  const location = useLocation();
  return <Navigate to={`/instance/settings${location.search}${location.hash}`} replace />;
}

function OnboardingRoutePage() {
  const { companies, loading } = useCompany();
  const { onboardingOpen, openOnboarding } = useDialog();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const opened = useRef(false);

  if (!getTenantSlug()) {
    return <Navigate to="/tenant-select" replace />;
  }

  const matchedCompany = companyPrefix
    ? companies.find((company) => company.issuePrefix.toUpperCase() === companyPrefix.toUpperCase()) ?? null
    : null;

  useEffect(() => {
    if (loading || opened.current || onboardingOpen) return;
    opened.current = true;
    if (matchedCompany) {
      openOnboarding({ initialStep: 2, companyId: matchedCompany.id });
      return;
    }
    openOnboarding();
  }, [companyPrefix, loading, matchedCompany, onboardingOpen, openOnboarding]);

  const { t } = useTranslation();
  const title = matchedCompany
    ? t("app.onboardingTitleAddAgent", { name: matchedCompany.name })
    : companies.length > 0
      ? t("app.onboardingTitleAnotherCompany")
      : t("app.onboardingTitleFirst");
  const description = matchedCompany
    ? t("app.onboardingDescAddAgent")
    : companies.length > 0
      ? t("app.onboardingDescAnotherCompany")
      : t("app.onboardingDescFirst");

  return (
    <div className="app-gate-wrap">
      <div className="app-gate-card">
        <h1 className="app-gate-title">{title}</h1>
        <p className="app-gate-desc">{description}</p>
        <div className="app-gate-actions">
          <Button
            onClick={() =>
              matchedCompany
                ? openOnboarding({ initialStep: 2, companyId: matchedCompany.id })
                : openOnboarding()
            }
          >
            {matchedCompany ? t("app.addAgent") : t("app.startOnboarding")}
          </Button>
        </div>
        <AppGateSessionActions />
      </div>
    </div>
  );
}

function CompanyRootRedirect() {
  const { t } = useTranslation();
  const { companies, selectedCompany, loading } = useCompany();
  const { onboardingOpen } = useDialog();

  if (!getTenantSlug()) {
    return <Navigate to="/tenant-select" replace />;
  }

  if (loading) {
    return <div className="mx-auto max-w-xl py-10 text-sm text-muted-foreground">{t("app.loading")}</div>;
  }

  // Keep the first-run onboarding mounted until it completes.
  if (onboardingOpen) {
    return <NoCompaniesStartPage autoOpen={false} />;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
}

function UnprefixedBoardRedirect() {
  const { t } = useTranslation();
  const location = useLocation();
  const { companies, selectedCompany, loading } = useCompany();

  if (!getTenantSlug()) {
    return <Navigate to="/tenant-select" replace />;
  }

  if (loading) {
    return <div className="app-gate-wrap app-gate-message">{t("app.loading")}</div>;
  }

  const targetCompany = selectedCompany ?? companies[0] ?? null;
  if (!targetCompany) {
    return <NoCompaniesStartPage />;
  }

  return (
    <Navigate
      to={`/${targetCompany.issuePrefix}${location.pathname}${location.search}${location.hash}`}
      replace
    />
  );
}

function NoCompaniesStartPage({ autoOpen = true }: { autoOpen?: boolean }) {
  const { t } = useTranslation();
  const { openOnboarding } = useDialog();
  const opened = useRef(false);

  useEffect(() => {
    if (!autoOpen) return;
    if (opened.current) return;
    opened.current = true;
    openOnboarding();
  }, [autoOpen, openOnboarding]);

  return (
    <div className="app-gate-wrap">
      <div className="app-gate-card">
        <h1 className="app-gate-title">{t("app.createFirstCompany")}</h1>
        <p className="app-gate-desc">
          {t("app.createFirstCompanyDesc")}
        </p>
        <div className="app-gate-actions">
          <Button onClick={() => openOnboarding()}>{t("app.newCompany")}</Button>
        </div>
        <AppGateSessionActions />
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <Routes>
        <Route path="auth" element={<AuthPage />} />
        <Route path="board-claim/:token" element={<BoardClaimPage />} />
        <Route path="invite/:token" element={<InviteLandingPage />} />
        <Route path="landing" element={<Landing />} />

        <Route element={<CloudAccessGate />}>
          <Route index element={<CompanyRootRedirect />} />
          <Route path="tenant-select" element={<TenantSelectPage />} />
          <Route path="onboarding" element={<OnboardingRoutePage />} />
          <Route path="instance" element={<Navigate to="/instance/settings" replace />} />
          <Route path="instance/settings" element={<Layout />}>
            <Route index element={<InstanceSettings />} />
          </Route>
          <Route path="instance/default-company-path" element={<Layout />}>
            <Route index element={<DefaultCompanyPathSettings />} />
          </Route>
          <Route path="instance/compliance-retention" element={<Layout />}>
            <Route index element={<ComplianceRetentionSettings />} />
          </Route>
          <Route path="instance/archive-company" element={<Layout />}>
            <Route index element={<ArchiveCompanySettings />} />
          </Route>
          <Route path="instance/companies" element={<Layout />}>
            <Route index element={<InstanceCompanyManagement />} />
          </Route>
          <Route path="instance/groups" element={<Layout />}>
            <Route index element={<InstanceGroupManagement />} />
          </Route>
          <Route path="instance/users" element={<Layout />}>
            <Route index element={<InstanceUserManagement />} />
          </Route>
          <Route path="companies" element={<UnprefixedBoardRedirect />} />
          <Route path="issues" element={<UnprefixedBoardRedirect />} />
          <Route path="issues/:issueId" element={<UnprefixedBoardRedirect />} />
          <Route path="settings" element={<LegacySettingsRedirect />} />
          <Route path="settings/*" element={<LegacySettingsRedirect />} />
          <Route path="agents" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/new" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/:tab" element={<UnprefixedBoardRedirect />} />
          <Route path="agents/:agentId/runs/:runId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/overview" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/issues/:filter" element={<UnprefixedBoardRedirect />} />
          <Route path="projects/:projectId/configuration" element={<UnprefixedBoardRedirect />} />
          <Route path="chat" element={<UnprefixedBoardRedirect />} />
          <Route path="chat/:roomId" element={<UnprefixedBoardRedirect />} />
          <Route path="schedules" element={<UnprefixedBoardRedirect />} />
          <Route path="runs" element={<UnprefixedBoardRedirect />} />
          <Route path="tests/ux/runs" element={<UnprefixedBoardRedirect />} />
          <Route path="account" element={<Layout />}>
            <Route index element={<Account />} />
          </Route>
          <Route path=":companyPrefix" element={<Layout />}>
            {boardRoutes()}
          </Route>
          <Route path="*" element={<NotFoundPage scope="global" />} />
        </Route>
      </Routes>
      <OnboardingWizard />
    </>
  );
}
