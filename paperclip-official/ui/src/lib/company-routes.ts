const BOARD_ROUTE_ROOTS = new Set([
  "account",
  "dashboard",
  "companies",
  "company",
  "org",
  "goal-map",
  "agents",
  "projects",
  "issues",
  "goals",
  "schedules",
  "approvals",
  "costs",
  "governance",
  "activity",
  "inbox",
  "design-guide",
  /** 須與 App board 子路由一致；漏列時 Link 會把首段誤判為 company prefix（例如 /pricing → PRICING）。 */
  "pricing",
  "onboarding",
  "runs",
  "chat",
  "tests",
]);

const GLOBAL_ROUTE_ROOTS = new Set(["auth", "invite", "board-claim", "docs", "instance", "landing"]);

export function normalizeCompanyPrefix(prefix: string): string {
  return prefix.trim().toUpperCase();
}

function splitPath(path: string): { pathname: string; search: string; hash: string } {
  const match = path.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    pathname: match?.[1] ?? path,
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  };
}

function getRootSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ?? null;
}

export function isGlobalPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const root = getRootSegment(pathname);
  if (!root) return true;
  return GLOBAL_ROUTE_ROOTS.has(root.toLowerCase());
}

export function isBoardPathWithoutPrefix(pathname: string): boolean {
  const root = getRootSegment(pathname);
  if (!root) return false;
  return BOARD_ROUTE_ROOTS.has(root.toLowerCase());
}

export function extractCompanyPrefixFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0]!.toLowerCase();
  if (GLOBAL_ROUTE_ROOTS.has(first) || BOARD_ROUTE_ROOTS.has(first)) {
    return null;
  }
  return normalizeCompanyPrefix(segments[0]!);
}

export function applyCompanyPrefix(path: string, companyPrefix: string | null | undefined): string {
  const { pathname, search, hash } = splitPath(path);
  if (!pathname.startsWith("/")) return path;
  if (isGlobalPath(pathname)) return path;
  if (!companyPrefix) return path;

  const prefix = normalizeCompanyPrefix(companyPrefix);
  const activePrefix = extractCompanyPrefixFromPath(pathname);
  if (activePrefix) return path;

  return `/${prefix}${pathname}${search}${hash}`;
}

/**
 * 從 path 去掉開頭的 company prefix 段，只保留 board/global 路徑。
 * 例如 /HOPA/CMP/dashboard → /dashboard，避免切換公司時重複疊加 prefix。
 */
export function toCompanyRelativePath(path: string): string {
  const { pathname, search, hash } = splitPath(path);
  const segments = pathname.split("/").filter(Boolean);

  const rootIndex = segments.findIndex(
    (s) =>
      GLOBAL_ROUTE_ROOTS.has(s.toLowerCase()) || BOARD_ROUTE_ROOTS.has(s.toLowerCase()),
  );
  if (rootIndex >= 0) {
    return `/${segments.slice(rootIndex).join("/")}${search}${hash}`;
  }

  return pathname ? `${pathname}${search}${hash}` : `/dashboard${search}${hash}`;
}
