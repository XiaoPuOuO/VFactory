import type { ReactNode } from "react";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div className="board-sidebar-section">
      <div className="board-sidebar-section-label">{label}</div>
      <div className="board-sidebar-section-children">{children}</div>
    </div>
  );
}
