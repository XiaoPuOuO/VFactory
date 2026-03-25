import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import {
  House,
  CircleDot,
  SquarePen,
  Users,
  Inbox,
} from "lucide-react";
import { useDialog } from "../context/DialogContext";
import { useInboxBadge } from "../hooks/useInboxBadge";

interface MobileBottomNavProps {
  visible: boolean;
}

interface MobileNavLinkItem {
  type: "link";
  to: string;
  label: string;
  icon: typeof House;
  badge?: number;
}

interface MobileNavActionItem {
  type: "action";
  label: string;
  icon: typeof SquarePen;
  onClick: () => void;
}

type MobileNavItem = MobileNavLinkItem | MobileNavActionItem;

export function MobileBottomNav({ visible }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { selectedCompanyId, companies, loading: companiesLoading, error: companiesError } = useCompany();
  const isInstanceSettingsRoute = location.pathname.startsWith("/instance/");
  const { openNewIssue } = useDialog();
  const inboxBadge = useInboxBadge(selectedCompanyId);

  const items = useMemo<MobileNavItem[]>(
    () => [
      { type: "link", to: "/dashboard", label: t("nav.home"), icon: House },
      { type: "link", to: "/issues", label: t("nav.issues"), icon: CircleDot },
      { type: "action", label: t("nav.createAction"), icon: SquarePen, onClick: () => openNewIssue() },
      { type: "link", to: "/agents/all", label: t("nav.agents"), icon: Users },
      {
        type: "link",
        to: "/inbox",
        label: t("nav.inbox"),
        icon: Inbox,
        badge: inboxBadge.inbox,
      },
    ],
    [openNewIssue, inboxBadge.inbox, t],
  );

  const hideMobileNav =
    !companiesLoading && !companiesError && companies.length === 0 && !isInstanceSettingsRoute;
  if (hideMobileNav) return null;

  return (
    <nav
      className={`board-mobile-nav ${visible ? "visible" : "hidden"}`}
      aria-label={t("nav.mobileNav")}
    >
      <div className="board-mobile-nav-grid">
        {items.map((item) => {
          if (item.type === "action") {
            const Icon = item.icon;
            const active = /\/issues\/new(?:\/|$)/.test(location.pathname);
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={["board-mobile-nav-item", active && "active"].filter(Boolean).join(" ")}
              >
                <Icon className="board-mobile-nav-item-icon" />
                <span>{item.label}</span>
              </button>
            );
          }

          const Icon = item.icon;
          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                ["board-mobile-nav-item", isActive && "active"].filter(Boolean).join(" ")
              }
            >
              <span className="relative">
                <Icon className="board-mobile-nav-item-icon" />
                {item.badge != null && item.badge > 0 && (
                  <span className="board-mobile-nav-item-badge">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
