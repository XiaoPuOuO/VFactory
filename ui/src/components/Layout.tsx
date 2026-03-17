import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Moon, Settings, Sun, User } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import { CompanyRail } from "./CompanyRail";
import { Sidebar } from "./Sidebar";
import { InstanceSidebar } from "./InstanceSidebar";
import { SidebarNavItem } from "./SidebarNavItem";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { PropertiesPanel } from "./PropertiesPanel";
import { CommandPalette } from "./CommandPalette";
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
import { meApi, canAccessInstanceSettings } from "../api/me";
import { queryKeys } from "../lib/queryKeys";
import { NotFoundPage } from "../pages/NotFound";
import { Button } from "@/components/ui/button";

import "../styles/board.css";

export function Layout() {
  const { t } = useTranslation();
  const { sidebarOpen, setSidebarOpen, toggleSidebar, isMobile, sidebarWidth, setSidebarWidth } = useSidebar();
  const { openNewIssue, openOnboarding } = useDialog();
  const { togglePanelVisible } = usePanel();
  const {
    companies,
    loading: companiesLoading,
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
  const { data: health } = useQuery({
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

  useEffect(() => {
    if (companiesLoading || onboardingTriggered.current) return;
    if (health?.deploymentMode === "authenticated") return;
    if (companies.length === 0) {
      onboardingTriggered.current = true;
      openOnboarding();
    }
  }, [companies, companiesLoading, openOnboarding, health?.deploymentMode]);

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
    if (!isMobile) {
      setMobileNavVisible(true);
      return;
    }
    lastMainScrollTop.current = 0;
    setMobileNavVisible(true);
  }, [isMobile]);

  // Swipe gesture to open/close sidebar on mobile
  useEffect(() => {
    if (!isMobile) return;

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
  }, [isMobile, sidebarOpen, setSidebarOpen]);

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
      className={`board-root ${isMobile ? "board-root-mobile" : "board-root-desktop"}`}
    >
      <a href="#main-content" className="board-skip-link">
        {t("common.skipToMainContent")}
      </a>
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="board-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label={t("common.closeSidebar")}
        />
      )}

      {isMobile ? (
        <div className={`board-sidebar-wrap-mobile ${sidebarOpen ? "open" : "closed"}`}>
          <div className="board-sidebar-inner">
            <CompanyRail />
            {isInstanceSettingsRoute ? <InstanceSidebar /> : <Sidebar />}
          </div>
          <div className="board-sidebar-footer">
            <div className="board-sidebar-footer-btn-wrap">
              <SidebarNavItem
                to="/account"
                label={t("nav.account")}
                icon={User}
              />
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
              <CompanyRail />
              <div
                className="board-sidebar-collapsible"
                style={{ width: sidebarOpen ? sidebarWidth : 0 }}
              >
                {isInstanceSettingsRoute ? <InstanceSidebar /> : <Sidebar />}
              </div>
            </div>
            <div className="board-sidebar-footer">
              <div className="board-sidebar-footer-btn-wrap">
                <SidebarNavItem
                  to="/account"
                  label={t("nav.account")}
                  icon={User}
                />
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
      )}

      <div className={`board-main-wrap ${isMobile ? "board-main-wrap-mobile" : "board-main-wrap-desktop"}`}>
        <div className={isMobile ? "board-breadcrumb-bar-mobile-sticky" : ""}>
          <BreadcrumbBar />
        </div>
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
      {isMobile && <MobileBottomNav visible={mobileNavVisible} />}
      <CommandPalette />
      <NewIssueDialog />
      <NewProjectDialog />
      <NewGoalDialog />
      <NewAgentDialog />
      <ToastViewport />
    </div>
  );
}
