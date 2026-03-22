import type { Issue } from "@paperclipai/shared";

/** 供 `data ?? stableEmpty` 使用，避免 `?? []` 每次 render 新建陣列導致子元件 memo / effect 失效。 */
export const EMPTY_ISSUE_LIST: Issue[] = [];
