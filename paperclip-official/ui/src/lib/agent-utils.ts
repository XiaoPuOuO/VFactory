import type { Agent } from "@paperclipai/shared";

/**
 * 從 Agent 的 adapterConfig 取得目前設定的模型 ID。
 * 空字串表示使用 adapter 預設（Configuration 頁的 "Default" / "auto"）。
 */
export function getAgentModelId(agent: Agent): string {
  const raw = agent.adapterConfig && (agent.adapterConfig as Record<string, unknown>).model;
  return typeof raw === "string" ? raw : "";
}

/**
 * 從 Agent 列表收集所有出現過的模型 ID（含預設），去重後排序。
 * 用於篩選下拉選單選項；回傳格式為 { id, label }，id 為空時 label 為 "Default"。
 */
export function getModelOptionsFromAgents(agents: Agent[]): { id: string; label: string }[] {
  const seen = new Set<string>();
  for (const a of agents) {
    seen.add(getAgentModelId(a));
  }
  const ids = Array.from(seen).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return ids.map((id) => ({ id, label: id === "" ? "Default" : id }));
}
