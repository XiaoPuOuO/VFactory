import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Calendar,
  CircleDot,
  CreditCard,
  DollarSign,
  History,
  LayoutDashboard,
  Map,
  MessageCircle,
  Network,
  Scale,
  Settings,
  Target,
  BookText,
  Zap,
  Inbox,
  Hexagon,
  Users,
  ClipboardCheck,
} from "lucide-react";

/** 與設計規格 §6.2 一致：固定完整側邊欄時寫入。 */
export const SIDEBAR_EXPANDED_KEY = "paperclip.sidebar.expanded";

export const SIDEBAR_PROJECTS_OPEN_KEY = "paperclip.sidebar.projectsOpen";
export const SIDEBAR_AGENTS_OPEN_KEY = "paperclip.sidebar.agentsOpen";
export const SIDEBAR_MORE_OPEN_KEY = "paperclip.sidebar.moreOpen";

export type NavItemDef = {
  id: string;
  /** 傳給 NavLink；會經由 company router 加上前綴 */
  path: string;
  /** i18n：`nav.${labelKey}` */
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
};

/**
 * 精簡模式主列常顯（不含新增議題 CTA）。
 * 核准、成本、帳單、設定與目標一樣不收入「更多」。
 */
export const primaryNavItems: NavItemDef[] = [
  { id: "dashboard", path: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { id: "inbox", path: "/inbox", labelKey: "inbox", icon: Inbox },
  { id: "issues", path: "/issues", labelKey: "issues", icon: CircleDot },
  { id: "goals", path: "/goals", labelKey: "goals", icon: Target },
  { id: "chat", path: "/chat", labelKey: "chat", icon: MessageCircle },
  { id: "projects", path: "/projects", labelKey: "projectList", icon: Hexagon },
  { id: "agents", path: "/agents/all", labelKey: "agentList", icon: Users },
  { id: "approvals", path: "/approvals/pending", labelKey: "approvals", icon: ClipboardCheck },
  { id: "billing", path: "/company/billing", labelKey: "billing", icon: CreditCard },
  { id: "settings", path: "/company/settings", labelKey: "settings", icon: Settings },
  { id: "costs", path: "/costs", labelKey: "costs", icon: DollarSign },
];

/** 「更多」內：工作相關 */
export const secondaryWorkNavItems: NavItemDef[] = [
  { id: "schedules", path: "/schedules", labelKey: "schedules", icon: Calendar },
  { id: "skills", path: "/company/workflows", labelKey: "skills", icon: BookText },
  { id: "runQuality", path: "/runs", labelKey: "runQuality", icon: Activity },
];

/** 固定完整模式下「公司」區八項（單一來源） */
export const fullModeCompanyNavItems: NavItemDef[] = [
  { id: "orgChart", path: "/org", labelKey: "orgChart", icon: Network },
  { id: "goalMap", path: "/goal-map", labelKey: "goalMap", icon: Map },
  { id: "governance", path: "/governance", labelKey: "governance", icon: Scale },
  { id: "automation", path: "/company/automation", labelKey: "automation", icon: Zap },
  { id: "costs", path: "/costs", labelKey: "costs", icon: DollarSign },
  { id: "billing", path: "/company/billing", labelKey: "billing", icon: CreditCard },
  { id: "activity", path: "/activity", labelKey: "activity", icon: History },
  { id: "settings", path: "/company/settings", labelKey: "settings", icon: Settings },
];

const MORE_COMPANY_IDS = new Set([
  "orgChart",
  "goalMap",
  "governance",
  "automation",
  "activity",
]);

/** 「更多」內：公司相關（其餘公司連結已在主列） */
export const secondaryCompanyNavItems: NavItemDef[] = fullModeCompanyNavItems.filter((item) =>
  MORE_COMPANY_IDS.has(item.id),
);

/** 固定完整模式下列出的工作區項目（含核准） */
export const fullModeWorkNavItems: NavItemDef[] = [
  { id: "chat", path: "/chat", labelKey: "chat", icon: MessageCircle },
  { id: "issues", path: "/issues", labelKey: "issues", icon: CircleDot },
  { id: "goals", path: "/goals", labelKey: "goals", icon: Target },
  { id: "schedules", path: "/schedules", labelKey: "schedules", icon: Calendar },
  { id: "skills", path: "/company/workflows", labelKey: "skills", icon: BookText },
  { id: "runQuality", path: "/runs", labelKey: "runQuality", icon: Activity },
  { id: "approvals", path: "/approvals/pending", labelKey: "approvals", icon: ClipboardCheck },
];

/** Command palette 與側欄共用的完整頁面清單（不重複 primary 與 secondary） */
export const allBoardNavItemsForPalette: NavItemDef[] = [
  ...primaryNavItems,
  ...secondaryWorkNavItems,
  ...secondaryCompanyNavItems,
];

/** Board 路由可能為 `/` 或 `/:companyPrefix/...`，去掉第一層公司前綴以便比對 nav path。 */
function stripCompanyPrefix(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    return `/${segments.slice(1).join("/")}`;
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

/** 目前路徑是否落在「更多」內任一項目（用於預設展開更多） */
export function isPathInSecondaryNav(pathname: string): boolean {
  const p = stripCompanyPrefix(pathname);
  const allSecondary = [...secondaryWorkNavItems, ...secondaryCompanyNavItems];
  return allSecondary.some((item) => {
    if (p === item.path || p.startsWith(`${item.path}/`)) return true;
    return false;
  });
}

export function readSidebarExpanded(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeSidebarExpanded(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}

export function readStoredTriState(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeStoredTriState(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    /* ignore */
  }
}
