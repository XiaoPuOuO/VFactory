import { useTranslation } from "react-i18next";
import { NavLink } from "@/lib/router";
import { useSidebar } from "../context/SidebarContext";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  className?: string;
  badge?: number;
  badgeTone?: "default" | "danger";
  alert?: boolean;
  liveCount?: number;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
  className,
  badge,
  badgeTone = "default",
  alert = false,
  liveCount,
}: SidebarNavItemProps) {
  const { t } = useTranslation();
  const { isMobile, setSidebarOpen } = useSidebar();

  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => { if (isMobile) setSidebarOpen(false); }}
      className={({ isActive }) =>
        ["board-nav-item", isActive && "active", className].filter(Boolean).join(" ")
      }
    >
      <span className="board-nav-item-icon">
        <Icon />
        {alert && <span className="board-nav-item-alert-dot" aria-hidden />}
      </span>
      <span className="board-nav-item-label">{label}</span>
      {liveCount != null && liveCount > 0 && (
        <span className="board-nav-item-live">
          <span className="board-nav-item-live-dot" />
          <span className="board-nav-item-live-count">{t("nav.liveCount", { count: liveCount })}</span>
        </span>
      )}
      {badge != null && badge > 0 && (
        <span className={`board-nav-item-badge ${badgeTone}`}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}
