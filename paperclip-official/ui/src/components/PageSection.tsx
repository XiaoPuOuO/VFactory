import type { ReactNode } from "react";
import "./PageSection.css";

interface PageSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * 頁面內小節：標題 + 內容，使用 ds-stack 與權杖字級。
 */
export function PageSection({ title, children, className }: PageSectionProps) {
  return (
    <section
      className={["page-section", "ds-stack", "ds-stack--sm", className].filter(Boolean).join(" ")}
    >
      <h3 className="page-section-title">{title}</h3>
      {children}
    </section>
  );
}
