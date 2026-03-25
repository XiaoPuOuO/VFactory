import { useEffect } from "react";
import { Link, useLocation } from "@/lib/router";
import { AlertTriangle, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";

type NotFoundScope = "board" | "invalid_company_prefix" | "global";

interface NotFoundPageProps {
  scope?: NotFoundScope;
  requestedPrefix?: string;
}

export function NotFoundPage({ scope = "global", requestedPrefix }: NotFoundPageProps) {
  const location = useLocation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { companies, selectedCompany } = useCompany();

  useEffect(() => {
    setBreadcrumbs([{ label: "Not Found" }]);
  }, [setBreadcrumbs]);

  const fallbackCompany = selectedCompany ?? companies[0] ?? null;
  const dashboardHref = fallbackCompany ? `/${fallbackCompany.issuePrefix}/dashboard` : "/";
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const normalizedPrefix = requestedPrefix?.toUpperCase();

  const title = scope === "invalid_company_prefix" ? "Company not found" : "Page not found";
  const description =
    scope === "invalid_company_prefix"
      ? `No company matches prefix "${normalizedPrefix ?? "unknown"}".`
      : "This route does not exist.";

  return (
    <div className="app-not-found-wrap">
      <div className="app-not-found-card">
        <div className="app-not-found-header">
          <div className="app-not-found-icon-wrap">
            <AlertTriangle />
          </div>
          <div>
            <h1 className="app-not-found-title">{title}</h1>
            <p className="app-not-found-desc">{description}</p>
          </div>
        </div>

        <div className="app-not-found-path">
          Requested path: <code>{currentPath}</code>
        </div>

        <div className="app-not-found-actions">
          <Button asChild>
            <Link to={dashboardHref}>
              <Compass />
              Open dashboard
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
