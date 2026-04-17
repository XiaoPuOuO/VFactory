import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@/lib/router";
import { Search, SquarePen, ChevronRight, Inbox, LayoutDashboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  fullModeCompanyNavItems,
  fullModeWorkNavItems,
  isPathInSecondaryNav,
  primaryNavItems,
  readSidebarExpanded,
  readStoredTriState,
  secondaryCompanyNavItems,
  secondaryWorkNavItems,
  SIDEBAR_MORE_OPEN_KEY,
  writeSidebarExpanded,
  writeStoredTriState,
} from "../lib/navConfig";

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  const secondaryActive = useMemo(
    () => isPathInSecondaryNav(location.pathname),
    [location.pathname],
  );

  const [pinnedFullNav, setPinnedFullNav] = useState(readSidebarExpanded);
  const [moreOpen, setMoreOpen] = useState(() =>
    readStoredTriState(SIDEBAR_MORE_OPEN_KEY, secondaryActive),
  );

  function setMoreOpenPersist(v: boolean) {
    setMoreOpen(v);
    writeStoredTriState(SIDEBAR_MORE_OPEN_KEY, v);
  }

  function togglePin() {
    const next = !pinnedFullNav;
    setPinnedFullNav(next);
    writeSidebarExpanded(next);
  }

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <aside className="board-sidebar">
      <div className="board-sidebar-top">
        {selectedCompany?.brandColor && (
          <div
            className="board-sidebar-top-brand"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="board-sidebar-top-title">
          {selectedCompany?.name ?? t("common.selectCompany")}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="board-sidebar-footer-icon-btn"
          onClick={openSearch}
        >
          <Search />
        </Button>
      </div>

      <nav className="board-sidebar-nav" aria-label={t("nav.sidebarNav")}>
        <div className="board-sidebar-nav-section">
          <button
            type="button"
            onClick={() => openNewIssue()}
            className="board-sidebar-new-issue-btn"
          >
            <SquarePen className="board-sidebar-new-issue-btn-icon" />
            <span>{t("nav.newIssue")}</span>
          </button>
          <SidebarNavItem
            to="/dashboard"
            label={t("nav.dashboard")}
            icon={LayoutDashboard}
            liveCount={liveRunCount}
          />
          <SidebarNavItem
            to="/inbox"
            label={t("nav.inbox")}
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
        </div>

        {pinnedFullNav ? (
          <>
            <div className="board-sidebar-nav-section board-sidebar-nav-group-gap">
              <SidebarSection label={t("nav.work")}>
                {fullModeWorkNavItems.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    to={item.path}
                    label={t(`nav.${item.labelKey}`)}
                    icon={item.icon}
                  />
                ))}
              </SidebarSection>
            </div>
            <SidebarProjects pinnedFullNav={pinnedFullNav} />
            <SidebarAgents pinnedFullNav={pinnedFullNav} />
            <div className="board-sidebar-nav-section board-sidebar-nav-group-gap">
              <SidebarSection label={t("nav.company")}>
                {fullModeCompanyNavItems.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    to={item.path}
                    label={t(`nav.${item.labelKey}`)}
                    icon={item.icon}
                  />
                ))}
              </SidebarSection>
            </div>
          </>
        ) : (
          <>
            <div className="board-sidebar-nav-section board-sidebar-nav-group-gap">
              {primaryNavItems.slice(2).map((item) => (
                <SidebarNavItem
                  key={item.id}
                  to={item.path}
                  label={t(`nav.${item.labelKey}`)}
                  icon={item.icon}
                />
              ))}
            </div>
            <Collapsible open={moreOpen} onOpenChange={setMoreOpenPersist}>
              <div
                className={["board-sidebar-collapsible-group", moreOpen && "open"].filter(Boolean).join(" ")}
              >
                <div className="board-sidebar-collapsible-row">
                  <CollapsibleTrigger
                    className="board-sidebar-collapsible-trigger"
                    aria-label={t("nav.moreNav")}
                  >
                    <ChevronRight className="board-sidebar-collapsible-chevron" />
                    <span className="board-sidebar-collapsible-label">{t("nav.more")}</span>
                  </CollapsibleTrigger>
                </div>
              </div>
              <CollapsibleContent>
                <div className="board-sidebar-more-content board-sidebar-nav-group-gap">
                  <SidebarSection label={t("nav.work")}>
                    {secondaryWorkNavItems.map((item) => (
                      <SidebarNavItem
                        key={item.id}
                        to={item.path}
                        label={t(`nav.${item.labelKey}`)}
                        icon={item.icon}
                      />
                    ))}
                  </SidebarSection>
                  <SidebarSection label={t("nav.company")}>
                    {secondaryCompanyNavItems.map((item) => (
                      <SidebarNavItem
                        key={item.id}
                        to={item.path}
                        label={t(`nav.${item.labelKey}`)}
                        icon={item.icon}
                      />
                    ))}
                  </SidebarSection>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}

        <div className="board-sidebar-pin-row">
          <button
            type="button"
            className="board-sidebar-pin-btn"
            onClick={togglePin}
            aria-pressed={pinnedFullNav}
          >
            {pinnedFullNav ? t("nav.useCompactNav") : t("nav.pinFullSidebar")}
          </button>
        </div>
      </nav>
    </aside>
  );
}
