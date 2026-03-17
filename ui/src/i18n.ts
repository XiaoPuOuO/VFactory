/**
 * i18n 設定：依瀏覽器語言顯示繁體中文或英文。
 * 使用 navigator.languages（使用者偏好順序），不用 navigator.language；
 * Chrome 的 navigator.language 是「瀏覽器 UI 語言」，不是「內容偏好」。
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";

const supportedLngs = ["en", "zh-TW"] as const;
export type SupportedLocale = (typeof supportedLngs)[number];

function detectLanguage(): SupportedLocale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages ?? [navigator.language ?? (navigator as { userLanguage?: string }).userLanguage ?? "en"];
  for (const tag of languages) {
    const lang = (tag || "").split("-")[0].toLowerCase();
    if (lang === "zh") return "zh-TW";
    if (lang === "en") return "en";
  }
  return "en";
}

/** 頁面使用的 namespace，須與 locales 頂層 key 一致；新增頁面時請加入此列表並在 locales 新增對應 key。 */
const PAGE_NAMESPACES = [
  "activity",
  "approvals",
  "chat",
  "company",
  "costs",
  "goalMap",
  "goals",
  "org",
  "onboarding",
  "pathInstructions",
  "project",
  "schedules",
  "nav",
  "common",
] as const;

/** 將頂層 key 註冊為獨立 namespace，讓 useTranslation("costs")、useTranslation("goalMap") 等能正確解析。 */
function buildResources(
  raw: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = { translation: raw };
  for (const key of Object.keys(raw)) {
    if (typeof raw[key] === "object" && raw[key] !== null && !Array.isArray(raw[key])) {
      out[key] = raw[key] as Record<string, unknown>;
    }
  }
  for (const ns of PAGE_NAMESPACES) {
    if (!out[ns]) {
      out[ns] = {};
    }
  }
  return out;
}

i18n.use(initReactI18next).init({
  resources: {
    en: buildResources(en as Record<string, unknown>),
    "zh-TW": buildResources(zhTW as Record<string, unknown>),
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  supportedLngs: supportedLngs as unknown as string[],
  ns: ["translation", ...PAGE_NAMESPACES],
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
