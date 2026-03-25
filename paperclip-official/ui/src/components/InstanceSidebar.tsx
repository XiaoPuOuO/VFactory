import { useTranslation } from "react-i18next";
import { Archive, Building2, FolderOpen, Settings, Users, UserCog } from "lucide-react";
import { SidebarNavItem } from "./SidebarNavItem";

export function InstanceSidebar() {
  const { t } = useTranslation();
  return (
    <aside className="board-sidebar">
      <div className="board-instance-sidebar-title">
        <Settings className="board-instance-sidebar-title-icon" />
        <span className="board-instance-sidebar-title-text">
          {t("instance.instanceSettings")}
        </span>
      </div>

      <nav className="board-sidebar-nav scrollbar-auto-hide">
        <div className="board-sidebar-nav-section">
          <SidebarNavItem
            to="/instance/users"
            label={t("instance.userManagement")}
            icon={UserCog}
          />
          <SidebarNavItem
            to="/instance/default-company-path"
            label={t("instance.defaultCompanyPath")}
            icon={FolderOpen}
          />
          <SidebarNavItem
            to="/instance/groups"
            label={t("instance.groupManagement")}
            icon={Users}
          />
          <SidebarNavItem
            to="/instance/companies"
            label={t("instance.companyManagement")}
            icon={Building2}
          />
          <SidebarNavItem
            to="/instance/archive-company"
            label={t("instance.archiveCompanySettings")}
            icon={Archive}
          />
        </div>
      </nav>
    </aside>
  );
}
