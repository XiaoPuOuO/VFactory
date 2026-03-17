import { type ReactNode } from "react";
import { Link } from "@/lib/router";

interface EntityRowProps {
  leading?: ReactNode;
  identifier?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  selected?: boolean;
  to?: string;
  onClick?: () => void;
  className?: string;
}

export function EntityRow({
  leading,
  identifier,
  title,
  subtitle,
  trailing,
  selected,
  to,
  onClick,
  className,
}: EntityRowProps) {
  const isClickable = !!(to || onClick);
  const rowClass = ["entity-row", isClickable && "clickable", selected && "selected", className].filter(Boolean).join(" ");

  const content = (
    <>
      {leading && <div className="entity-row-leading">{leading}</div>}
      <div className="entity-row-body">
        <div className="entity-row-body-inner">
          {identifier != null && identifier !== "" && (
            <span className="entity-row-identifier">{identifier}</span>
          )}
          <span className="entity-row-title">{title}</span>
        </div>
        {subtitle != null && subtitle !== "" && (
          <p className="entity-row-subtitle">{subtitle}</p>
        )}
      </div>
      {trailing != null && <div className="entity-row-trailing">{trailing}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`${rowClass} entity-row-link`} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div className={rowClass} onClick={onClick} role={isClickable ? "button" : undefined}>
      {content}
    </div>
  );
}
