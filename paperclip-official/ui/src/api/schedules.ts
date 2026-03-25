import type { AgentSchedule, CreateSchedule, ScheduleConflictRow, UpdateSchedule } from "@paperclipai/shared";
import { api } from "./client";

export type ListSchedulesFilters = { agentId?: string; enabled?: boolean };

export const schedulesApi = {
  list: (companyId: string, filters?: ListSchedulesFilters) => {
    const params = new URLSearchParams();
    if (filters?.agentId) params.set("agentId", filters.agentId);
    if (filters?.enabled !== undefined) params.set("enabled", String(filters.enabled));
    const q = params.toString();
    return api.get<AgentSchedule[]>(
      `/companies/${companyId}/schedules${q ? `?${q}` : ""}`,
    );
  },
  get: (companyId: string, scheduleId: string) =>
    api.get<AgentSchedule>(`/companies/${companyId}/schedules/${scheduleId}`),
  create: (companyId: string, data: CreateSchedule) =>
    api.post<AgentSchedule>(`/companies/${companyId}/schedules`, data),
  update: (companyId: string, scheduleId: string, data: UpdateSchedule) =>
    api.patch<AgentSchedule>(`/companies/${companyId}/schedules/${scheduleId}`, data),
  remove: (companyId: string, scheduleId: string) =>
    api.delete<AgentSchedule>(`/companies/${companyId}/schedules/${scheduleId}`),
  conflicts: (companyId: string, horizonDays = 7, thresholdSec = 60) => {
    const params = new URLSearchParams();
    params.set("horizonDays", String(horizonDays));
    params.set("thresholdSec", String(thresholdSec));
    return api.get<ScheduleConflictRow[]>(
      `/companies/${companyId}/schedules/conflicts?${params.toString()}`,
    );
  },
};
