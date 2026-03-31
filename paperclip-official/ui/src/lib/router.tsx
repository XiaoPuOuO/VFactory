import * as React from "react";
import * as RouterDom from "react-router-dom";
import type { NavigateOptions, To } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/context/CompanyContext";
import { WorkflowUnsavedContext } from "@/context/WorkflowUnsavedContext";
import {
  applyCompanyPrefix,
  extractCompanyPrefixFromPath,
  normalizeCompanyPrefix,
} from "@/lib/company-routes";

function resolveTo(to: To, companyPrefix: string | null): To {
  if (typeof to === "string") {
    return applyCompanyPrefix(to, companyPrefix);
  }

  if (to.pathname && to.pathname.startsWith("/")) {
    const pathname = applyCompanyPrefix(to.pathname, companyPrefix);
    if (pathname !== to.pathname) {
      return { ...to, pathname };
    }
  }

  return to;
}

function pathnameOnly(path: string): string {
  const i = path.search(/[?#]/);
  return i === -1 ? path : path.slice(0, i);
}

function resolveToPathname(to: To, companyPrefix: string | null): string {
  const resolved = resolveTo(to, companyPrefix);
  if (typeof resolved === "string") {
    return pathnameOnly(resolved);
  }
  const pathname = resolved.pathname ?? "";
  return pathnameOnly(pathname);
}

function useActiveCompanyPrefix(): string | null {
  const { selectedCompany } = useCompany();
  const params = RouterDom.useParams<{ companyPrefix?: string }>();
  const location = RouterDom.useLocation();

  if (params.companyPrefix) {
    return normalizeCompanyPrefix(params.companyPrefix);
  }

  const pathPrefix = extractCompanyPrefixFromPath(location.pathname);
  if (pathPrefix) return pathPrefix;

  return selectedCompany ? normalizeCompanyPrefix(selectedCompany.issuePrefix) : null;
}

export * from "react-router-dom";

export const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.Link>>(
  function CompanyLink({ to, onClick, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    const location = RouterDom.useLocation();
    const unsavedCtx = React.useContext(WorkflowUnsavedContext);
    const { t } = useTranslation("companySkills");
    const resolved = resolveTo(to, companyPrefix);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        const leftClick = e.button === 0;
        const plainNavigate =
          leftClick && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (plainNavigate && unsavedCtx?.getDirty()) {
          const nextPath = resolveToPathname(to, companyPrefix);
          if (nextPath !== pathnameOnly(location.pathname) && !window.confirm(t("unsavedLeaveWarning"))) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        onClick?.(e);
      },
      [unsavedCtx, to, companyPrefix, location.pathname, t, onClick],
    );

    return <RouterDom.Link ref={ref} to={resolved} {...props} onClick={handleClick} />;
  },
);

export const NavLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof RouterDom.NavLink>>(
  function CompanyNavLink({ to, onClick, ...props }, ref) {
    const companyPrefix = useActiveCompanyPrefix();
    const location = RouterDom.useLocation();
    const unsavedCtx = React.useContext(WorkflowUnsavedContext);
    const { t } = useTranslation("companySkills");
    const resolved = resolveTo(to, companyPrefix);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLAnchorElement>) => {
        const leftClick = e.button === 0;
        const plainNavigate =
          leftClick && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
        if (plainNavigate && unsavedCtx?.getDirty()) {
          const nextPath = resolveToPathname(to, companyPrefix);
          if (nextPath !== pathnameOnly(location.pathname) && !window.confirm(t("unsavedLeaveWarning"))) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        onClick?.(e);
      },
      [unsavedCtx, to, companyPrefix, location.pathname, t, onClick],
    );

    return <RouterDom.NavLink ref={ref} to={resolved} {...props} onClick={handleClick} />;
  },
);

export function Navigate({ to, ...props }: React.ComponentProps<typeof RouterDom.Navigate>) {
  const companyPrefix = useActiveCompanyPrefix();
  return <RouterDom.Navigate to={resolveTo(to, companyPrefix)} {...props} />;
}

export function useNavigate(): ReturnType<typeof RouterDom.useNavigate> {
  const navigate = RouterDom.useNavigate();
  const companyPrefix = useActiveCompanyPrefix();
  const location = RouterDom.useLocation();
  const unsavedCtx = React.useContext(WorkflowUnsavedContext);
  const { t } = useTranslation("companySkills");

  return React.useCallback(
    ((to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        if (unsavedCtx?.getDirty() && !window.confirm(t("unsavedLeaveWarning"))) {
          return;
        }
        navigate(to);
        return;
      }
      const nextPathname = resolveToPathname(to, companyPrefix);
      if (
        unsavedCtx?.getDirty() &&
        nextPathname !== pathnameOnly(location.pathname) &&
        !window.confirm(t("unsavedLeaveWarning"))
      ) {
        return;
      }
      navigate(resolveTo(to, companyPrefix), options);
    }) as ReturnType<typeof RouterDom.useNavigate>,
    [navigate, companyPrefix, location.pathname, unsavedCtx, t],
  );
}
