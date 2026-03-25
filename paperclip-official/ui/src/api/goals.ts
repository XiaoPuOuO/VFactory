import type { Goal, GoalProgress } from "@paperclipai/shared";
import { api } from "./client";

export const goalsApi = {
  list: (companyId: string) => api.get<Goal[]>(`/companies/${companyId}/goals`),
  get: (id: string) => api.get<Goal>(`/goals/${id}`),
  getProgress: (goalId: string, range?: { from?: string; to?: string }) => {
    const sp = new URLSearchParams();
    if (range?.from) sp.set("from", range.from);
    if (range?.to) sp.set("to", range.to);
    const q = sp.toString();
    return api.get<GoalProgress>(`/goals/${goalId}/progress${q ? `?${q}` : ""}`);
  },
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Goal>(`/companies/${companyId}/goals`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Goal>(`/goals/${id}`, data),
  remove: (id: string) => api.delete<Goal>(`/goals/${id}`),
  refreshNow: (id: string) => api.post<Goal>(`/goals/${id}/refresh-now`, {}),
};
