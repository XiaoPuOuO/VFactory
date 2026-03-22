import { useTranslation } from "react-i18next";
import {
  Activity,
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  Scale,
  History,
  Search,
  SquarePen,
  Network,
  Map,
  Settings,
  MessageCircle,
  Calendar,
  Zap,
} from "lucide-react";
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

export function Sidebar() {
  const { t } = useTranslation();
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

      <nav className="board-sidebar-nav">
        <div className="board-sidebar-nav-section">
          <button
            type="button"
            onClick={() => openNewIssue()}
            className="board-sidebar-new-issue-btn"
          >
            <SquarePen className="board-sidebar-new-issue-btn-icon" />
            <span>{t("nav.newIssue")}</span>
          </button>
          <SidebarNavItem to="/dashboard" label={t("nav.dashboard")} icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem
            to="/inbox"
            label={t("nav.inbox")}
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
        </div>

        <SidebarSection label={t("nav.work")}>
          <SidebarNavItem to="chat" label={t("nav.chat")} icon={MessageCircle} />
          <SidebarNavItem to="/issues" label={t("nav.issues")} icon={CircleDot} />
          <SidebarNavItem to="/goals" label={t("nav.goals")} icon={Target} />
          <SidebarNavItem to="/schedules" label={t("nav.schedules")} icon={Calendar} />
          <SidebarNavItem to="/runs" label={t("nav.runQuality")} icon={Activity} />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label={t("nav.company")}>
          <SidebarNavItem to="/org" label={t("nav.orgChart")} icon={Network} />
          <SidebarNavItem to="/goal-map" label={t("nav.goalMap")} icon={Map} />
          <SidebarNavItem to="/governance" label={t("nav.governance")} icon={Scale} />
          <SidebarNavItem to="/company/automation" label={t("nav.automation")} icon={Zap} />
          <SidebarNavItem to="/costs" label={t("nav.costs")} icon={DollarSign} />
          <SidebarNavItem to="/activity" label={t("nav.activity")} icon={History} />
          <SidebarNavItem to="/company/settings" label={t("nav.settings")} icon={Settings} />
        </SidebarSection>
      </nav>
    </aside>
  );
}
