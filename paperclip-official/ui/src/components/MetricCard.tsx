import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div className={isClickable ? "dashboard-metric-card-inner" : "dashboard-metric-card-inner"}>
      <div className="dashboard-metric-card-body">
        <div className="dashboard-metric-card-content">
          <p className="dashboard-metric-card-value">{value}</p>
          <p className="dashboard-metric-card-label">{label}</p>
          {description && (
            <div className="dashboard-metric-card-desc">{description}</div>
          )}
        </div>
        <Icon className="dashboard-metric-card-icon" />
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`dashboard-metric-card ${isClickable ? "clickable" : ""}`}
        onClick={onClick}
      >
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className={`dashboard-metric-card ${isClickable ? "clickable" : ""}`} onClick={onClick}>
        {inner}
      </div>
    );
  }

  return <div className="dashboard-metric-card">{inner}</div>;
}
