/**
 * 將多選集合修剪為仍存在於目前可見列表中的 id（篩選變更時避免指向幽靈選取）。
 */
export function pruneSelectionToVisible(selectedIds: Set<string>, visibleIssueIds: string[]): Set<string> {
  const vis = new Set(visibleIssueIds);
  return new Set([...selectedIds].filter((id) => vis.has(id)));
}

/** 兩個 Set 是否含相同元素（用於避免 setState 每次都回傳新 Set 參考而觸發無限更新）。 */
export function selectionSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}
