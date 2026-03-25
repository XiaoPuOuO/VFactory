import type { CreateIntegrationApiKeyInput } from "@paperclipai/shared";
import { API } from "@paperclipai/shared";
import { api } from "./client";

export type IntegrationApiKeyRow = {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type IntegrationApiKeyCreated = IntegrationApiKeyRow & { token: string };

export const integrationTokensApi = {
  list: (companyId: string) =>
    api.get<IntegrationApiKeyRow[]>(API.companyIntegrationTokens(companyId)),
  create: (companyId: string, data: CreateIntegrationApiKeyInput) =>
    api.post<IntegrationApiKeyCreated>(API.companyIntegrationTokens(companyId), data),
  remove: (companyId: string, keyId: string) =>
    api.delete<void>(API.companyIntegrationToken(companyId, keyId)),
};
