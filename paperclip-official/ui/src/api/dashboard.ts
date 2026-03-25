import type { DashboardSummary, DashboardTrends } from "@paperclipai/shared";
import { api } from "./client";

export const dashboardApi = {
  summary: (companyId: string) => api.get<DashboardSummary>(`/companies/${companyId}/dashboard`),
  trends: (companyId: string, days = 14) =>
    api.get<DashboardTrends>(`/companies/${companyId}/dashboard/trends?days=${days}`),
};
