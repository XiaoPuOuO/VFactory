import type { CreateIssueSavedView, IssueSavedView, UpdateIssueSavedView } from "@paperclipai/shared";
import { api } from "./client";

export const issueSavedViewsApi = {
  list: (companyId: string, scopeKey: string) => {
    const q = new URLSearchParams({ scopeKey });
    return api.get<IssueSavedView[]>(`/companies/${companyId}/issue-saved-views?${q.toString()}`);
  },
  create: (companyId: string, data: CreateIssueSavedView) =>
    api.post<IssueSavedView>(`/companies/${companyId}/issue-saved-views`, data),
  update: (companyId: string, viewId: string, data: UpdateIssueSavedView) =>
    api.patch<IssueSavedView>(`/companies/${companyId}/issue-saved-views/${viewId}`, data),
  remove: (companyId: string, viewId: string) =>
    api.delete<void>(`/companies/${companyId}/issue-saved-views/${viewId}`),
};
