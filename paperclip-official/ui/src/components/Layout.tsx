import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Moon, Settings, Sun, User } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import { CompanyRail } from "./CompanyRail";
import { Sidebar } from "./Sidebar";
import { InstanceSidebar } from "./InstanceSidebar";
import { SidebarNavItem } from "./SidebarNavItem";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { PropertiesPanel } from "./PropertiesPanel";
import { CommandPalette } from "./CommandPalette";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { OfflineBanner } from "./OfflineBanner";
import { NewIssueDialog } from "./NewIssueDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { NewGoalDialog } from "./NewGoalDialog";
import { NewAgentDialog } from "./NewAgentDialog";
import { ToastViewport } from "./ToastViewport";
import { MobileBottomNav } from "./MobileBottomNav";
import { useDialog } from "../context/DialogContext";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { useTheme } from "../context/ThemeContext";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useCompanyPageMemory } from "../hooks/useCompanyPageMemory";
import { healthApi } from "../api/health";
import { meApi, canAccessInstanceSettings, canAccessInstancePricing } from "../api/me";
import { queryKeys } from "../lib/queryKeys";
import { NotFoundPage } from "../pages/NotFound";
import { Button } from "@/components/ui/button";
import { authApi } from "../api/auth";

import "../styles/board.css";

/** 無公司且非 instance 設定時的底部列：僅登出與主題（無側欄）。 */
function NoCompanyBoardChrome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="board-no-company-chrome" role="toolbar" aria-label={t("app.noCompanyChromeNavLabel")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="board-no-company-chrome-signout"
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
        <LogOut className="board-no-company-chrome-icon" aria-hidden />
        {signingOut ? t("account.signingOut") : t("account.signOut")}
      </Button>
      <span className="board-no-company-chrome-spacer" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="board-sidebar-footer-icon-btn"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? t("nav.switchToLightMode") : t("nav.switchToDarkMode")}
        title={theme === "dark" ? t("nav.switchToLightMode") : t("nav.switchToDarkMode")}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}

/** 側欄底部：無公司時改為登出（不再顯示帳號管理連結）。 */
function LayoutSignOutNavButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isMobile, setSidebarOpen } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <button
      type="button"
      className="board-nav-item"
      disabled={signingOut}
      onClick={async () => {
        if (isMobile) setSidebarOpen(false);
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
      <span className="board-nav-item-icon">
        <LogOut />
      </span>
      <span className="board-nav-item-label">
        {signingOut ? t("account.signingOut") : t("account.signOut")}
      </span>
    </button>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen, toggleSidebar, isMobile, sidebarWidth, setSidebarWidth } = useSidebar();
  const { openNewIssue, openOnboarding } = useDialog();
  const { togglePanelVisible } = usePanel();
  const {
    companies,
    loading: companiesLoading,
    error: companiesError,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId,
  } = useCompany();
  const { theme, toggleTheme } = useTheme();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isInstanceSettingsRoute = location.pathname.startsWith("/instance/");
  const onboardingTriggered = useRef(false);
  const lastMainScrollTop = useRef(0);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const matchedCompany = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix) ?? null;
  }, [companies, companyPrefix]);
  const hasUnknownCompanyPrefix =
    Boolean(companyPrefix) && !companiesLoading && companies.length > 0 && !matchedCompany;
  const { data: health, isPending: healthPending } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });
  const { data: meProfile } = useQuery({
    queryKey: ["me"],
    queryFn: () => meApi.get(),
    retry: false,
  });
  const showSettingsButton = canAccessInstanceSettings(meProfile);
  const canManagePlans = canAccessInstancePricing(meProfile);
  const companiesReady = !companiesLoading && !companiesError;
  const noCompaniesReady = companiesReady && companies.length === 0;
  /** 無公司時不顯示看板側欄（例如 /account）；instance 設定仍保留導覽。 */
  const hideEntireSidebar = noCompaniesReady && !isInstanceSettingsRoute;

  useEffect(() => {
    if (companiesLoading || onboardingTriggered.current) return;
    // 部署模式尚未就緒時不可推論「沒有公司」：否則 authenticated 環境會短暫誤開建立公司精靈。
    if (healthPending) return;
    if (health?.deploymentMode === "authenticated") return;
    // 列表載入失敗時 data 可能為空陣列，不得當成「確實零間公司」。
    if (companiesError) return;
    if (companies.length === 0) {
      onboardingTriggered.current = true;
      openOnboarding();
    }
  }, [companies, companiesLoading, companiesError, openOnboarding, health?.deploymentMode, healthPending]);

  useEffect(() => {
    if (!companyPrefix || companiesLoading || companies.length === 0) return;

    if (!matchedCompany) {
      const fallback = (selectedCompanyId ? companies.find((company) => company.id === selectedCompanyId) : null)
        ?? companies[0]
        ?? null;
      if (fallback) {
        if (selectedCompanyId !== fallback.id) {
          setSelectedCompanyId(fallback.id, { source: "route_sync" });
        }
        if (companyPrefix) {
          navigate(`/${fallback.issuePrefix}/dashboard${location.search}${location.hash}`, {
            replace: true,
          });
          return;
        }
      }
      return;
    }

    if (companyPrefix !== matchedCompany.issuePrefix) {
      navigate(`/${matchedCompany.issuePrefix}/dashboard${location.search}${location.hash}`, { replace: true });
      return;
    }

    // 偵測 URL 重複疊加（例如 /HOPA/CMP/HOPA/CMP/...），一律導回 dashboard
    const prefixWithSlash = `/${matchedCompany.issuePrefix}/`;
    if (
      location.pathname.startsWith(prefixWithSlash) &&
      location.pathname.indexOf(prefixWithSlash, prefixWithSlash.length) !== -1
    ) {
      navigate(`/${matchedCompany.issuePrefix}/dashboard${location.search}${location.hash}`, { replace: true });
      return;
    }

    if (selectedCompanyId !== matchedCompany.id) {
      setSelectedCompanyId(matchedCompany.id, { source: "route_sync" });
    }
  }, [
    companyPrefix,
    companies,
    companiesLoading,
    matchedCompany,
    location.pathname,
    location.search,
    navigate,
    selectedCompanyId,
    setSelectedCompanyId,
  ]);

  const togglePanel = togglePanelVisible;

  useCompanyPageMemory();

  useKeyboardShortcuts({
    onNewIssue: () => openNewIssue(),
    onToggleSidebar: toggleSidebar,
    onTogglePanel: togglePanel,
  });

  useEffect(() => {
    function onOpenShortcuts() {
      setShortcutsOpen(true);
    }
    window.addEventListener("paperclip:open-shortcuts", onOpenShortcuts);
    return () => window.removeEventListener("paperclip:open-shortcuts", onOpenShortcuts);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      e.preventDefault();
      setShortcutsOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavVisible(true);
      return;
    }
    lastMainScrollTop.current = 0;
    setMobileNavVisible(true);
  }, [isMobile]);

  // Swipe gesture to open/close sidebar on mobile
  useEffect(() => {
    if (!isMobile || hideEntireSidebar) return;

    const EDGE_ZONE = 30; // px from left edge to start open-swipe
    const MIN_DISTANCE = 50; // minimum horizontal swipe distance
    const MAX_VERTICAL = 75; // max vertical drift before we ignore

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]!;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]!;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);

      if (dy > MAX_VERTICAL) return; // vertical scroll, ignore

      // Swipe right from left edge → open
      if (!sidebarOpen && startX < EDGE_ZONE && dx > MIN_DISTANCE) {
        setSidebarOpen(true);
        return;
      }

      // Swipe left when open → close
      if (sidebarOpen && dx < -MIN_DISTANCE) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, sidebarOpen, setSidebarOpen, hideEntireSidebar]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = sidebarWidth;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onPointerMove = (e: PointerEvent) => {
        setSidebarWidth(resizeStartWidth.current + (e.clientX - resizeStartX.current));
      };
      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    },
    [sidebarWidth, setSidebarWidth]
  );

  const updateMobileNavVisibility = useCallback((currentTop: number) => {
    const delta = currentTop - lastMainScrollTop.current;

    if (currentTop <= 24) {
      setMobileNavVisible(true);
    } else if (delta > 8) {
      setMobileNavVisible(false);
    } else if (delta < -8) {
      setMobileNavVisible(true);
    }

    lastMainScrollTop.current = currentTop;
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavVisible(true);
      lastMainScrollTop.current = 0;
      return;
    }

    const onScroll = () => {
      updateMobileNavVisibility(window.scrollY || document.documentElement.scrollTop || 0);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [isMobile, updateMobileNavVisibility]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = isMobile ? "visible" : "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile]);

  return (
    <div
      className={[
        "board-root",
        isMobile ? "board-root-mobile" : "board-root-desktop",
        hideEntireSidebar && "board-root--no-company-board",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a href="#main-content" className="board-skip-link">
        {t("common.skipToMainContent")}
      </a>
      {isMobile && sidebarOpen && !hideEntireSidebar && (
        <button
          type="button"
          className="board-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("common.closeSidebar")}
        />
      )}

      {!hideEntireSidebar &&
        (isMobile ? (
          <div className={`board-sidebar-wrap-mobile ${sidebarOpen ? "open" : "closed"}`}>
            <div className="board-sidebar-inner">
              {!noCompaniesReady && <CompanyRail />}
              {isInstanceSettingsRoute ? <InstanceSidebar canManagePlans={canManagePlans} /> : <Sidebar />}
            </div>
            <div className="board-sidebar-footer">
              <div className="board-sidebar-footer-btn-wrap">
                {noCompaniesReady ? (
                  <LayoutSignOutNavButton />
                ) : (
                  <SidebarNavItem to="/account" label={t("nav.account")} icon={User} />
                )}
              </div>
              {showSettingsButton && (
                <Button variant="ghost" size="icon-sm" className="board-sidebar-footer-icon-btn" asChild>
                  <Link
                    to="/instance/settings"
                    aria-label={t("nav.instanceSettings")}
                    title={t("nav.instanceSettings")}
                    onClick={() => {
                      if (isMobile) setSidebarOpen(false);
                    }}
                  >
                    <Settings />
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="board-sidebar-footer-icon-btn"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? t("nav.switchToLightMode") : t("nav.switchToDarkMode")}
                title={theme === "dark" ? t("nav.switchToLightMode") : t("nav.switchToDarkMode")}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="board-sidebar-wrap-desktop">
              <div className="board-sidebar-inner">
                {!noCompaniesReady && <CompanyRail />}
                <div
                  className="board-sidebar-collapsible"
                  style={{ width: sidebarOpen ? sidebarWidth : 0 }}
                >
                  {isInstanceSettingsRoute ? <InstanceSidebar canManagePlans={canManagePlans} /> : <Sidebar />}
                </div>
              </div>
              <div className="board-sidebar-footer">
                <div className="board-sidebar-footer-btn-wrap">
                  {noCompaniesReady ? (
                    <LayoutSignOutNavButton />
                  ) : (
                    <SidebarNavItem to="/account" label={t("nav.account")} icon={User} />
                  )}
                </div>
                {showSettingsButton && (
                  <Button variant="ghost" size="icon-sm" className="board-sidebar-footer-icon-btn" asChild>
                    <Link
                      to="/instance/settings"
                      aria-label={t("nav.instanceSettings")}
                      title={t("nav.instanceSettings")}
                      onClick={() => {
                        if (isMobile) setSidebarOpen(false);
                      }}
                    >
                      <Settings />
                    </Link>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="board-sidebar-footer-icon-btn"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${nextTheme} mode`}
                  title={`Switch to ${nextTheme} mode`}
                >
                  {theme === "dark" ? <Sun /> : <Moon />}
                </Button>
              </div>
            </div>

            {sidebarOpen && (
              <button
                type="button"
                className="board-resize-handle"
                onPointerDown={onResizePointerDown}
                aria-label={t("common.resizeSidebar")}
              />
            )}
          </>
        ))}

      {hideEntireSidebar && <NoCompanyBoardChrome />}

      <div className={`board-main-wrap ${isMobile ? "board-main-wrap-mobile" : "board-main-wrap-desktop"}`}>
        <div className={isMobile ? "board-breadcrumb-bar-mobile-sticky" : ""}>
          <BreadcrumbBar />
        </div>
        <OfflineBanner />
        <div className={["board-content-row", isMobile && "board-content-row-mobile"].filter(Boolean).join(" ")}>
          <main
            id="main-content"
            tabIndex={-1}
            className={["board-main", isMobile && "board-main-mobile"].filter(Boolean).join(" ")}
          >
            {hasUnknownCompanyPrefix ? (
              <NotFoundPage
                scope="invalid_company_prefix"
                requestedPrefix={companyPrefix ?? selectedCompany?.issuePrefix}
              />
            ) : (
              <Outlet />
            )}
          </main>
          <PropertiesPanel />
        </div>
      </div>
      {isMobile && !hideEntireSidebar && <MobileBottomNav visible={mobileNavVisible} />}
      <CommandPalette />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <NewIssueDialog />
      <NewProjectDialog />
      <NewGoalDialog />
      <NewAgentDialog />
      <ToastViewport />
    </div>
  );
}
