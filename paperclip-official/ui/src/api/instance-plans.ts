import type { CreateInstancePlanInput, InstancePlanRow, UpdateInstancePlanInput } from "@paperclipai/shared";
import { api } from "./client";

export const instancePlansApi = {
  list: () => api.get<{ plans: InstancePlanRow[] }>("/instance/plans"),
  create: (body: CreateInstancePlanInput) => api.post<InstancePlanRow>("/instance/plans", body),
  update: (planId: string, body: UpdateInstancePlanInput) =>
    api.patch<InstancePlanRow>(`/instance/plans/${planId}`, body),
  remove: (planId: string) => api.delete<{ plan: InstancePlanRow | null }>(`/instance/plans/${planId}`),
};
