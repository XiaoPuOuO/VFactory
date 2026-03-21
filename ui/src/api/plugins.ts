import { api } from "./client";

export type CompanyPluginApiItem = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string | null;
};

export const companyPluginsApi = {
  list: (companyId: string) =>
    api.get<{ plugins: CompanyPluginApiItem[] }>(`/companies/${companyId}/plugins`),
  patch: (
    companyId: string,
    pluginId: string,
    body: { enabled?: boolean; config?: Record<string, unknown> },
  ) => api.patch<CompanyPluginApiItem>(`/companies/${companyId}/plugins/${pluginId}`, body),
};
