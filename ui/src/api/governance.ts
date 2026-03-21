import type { GovernanceHubSummary } from "@paperclipai/shared";
import { api } from "./client";

export const governanceApi = {
  hub: (companyId: string) =>
    api.get<GovernanceHubSummary>(`/companies/${companyId}/governance`),
};
