import { useTranslation } from "react-i18next";
import { Link, useLocation } from "@/lib/router";
import { Menu } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

export function BreadcrumbBar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { breadcrumbs } = useBreadcrumbs();
  const { toggleSidebar, isMobile, sidebarOpen } = useSidebar();
  const { companies, loading: companiesLoading, error: companiesError } = useCompany();
  const isInstanceSettingsRoute = location.pathname.startsWith("/instance/");
  const hideBoardSidebar =
    !companiesLoading && !companiesError && companies.length === 0 && !isInstanceSettingsRoute;

  if (breadcrumbs.length === 0) return null;

  /** 麵包屑列左側的 Sidebar 切換：手機版一律顯示；桌面版在 Sidebar 收合時顯示以利展開，必要時可改為永遠顯示以支援收合 */
  const showMenuButton = (isMobile || !sidebarOpen) && !hideBoardSidebar;
  const menuButton = showMenuButton ? (
    <Button
      variant="ghost"
      size="icon-sm"
      className="board-breadcrumb-menu-btn"
      onClick={toggleSidebar}
      aria-label={sidebarOpen ? t("common.closeSidebar") : t("common.openSidebar")}
    >
      <Menu />
    </Button>
  ) : null;

  if (breadcrumbs.length === 1) {
    return (
      <div className="board-breadcrumb-bar">
        {menuButton}
        <h1 className="board-breadcrumb-title">{breadcrumbs[0].label}</h1>
      </div>
    );
  }

  return (
    <div className="board-breadcrumb-bar">
      {menuButton}
      <Breadcrumb className="board-breadcrumb-nav">
        <BreadcrumbList className="board-breadcrumb-list">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <Fragment key={i}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem className={isLast ? "board-breadcrumb-item-last" : "board-breadcrumb-item-shrink"}>
                  {isLast || !crumb.href ? (
                    <BreadcrumbPage className="board-breadcrumb-page-truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
