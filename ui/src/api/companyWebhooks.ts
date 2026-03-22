import type {
  CompanyWebhookEndpoint,
  CompanyWebhookEndpointCreated,
  CreateCompanyWebhookEndpoint,
  UpdateCompanyWebhookEndpoint,
} from "@paperclipai/shared";
import { API } from "@paperclipai/shared";
import { api } from "./client";

export const companyWebhooksApi = {
  list: (companyId: string) =>
    api.get<CompanyWebhookEndpoint[]>(API.companyWebhooks(companyId)),
  create: (companyId: string, data: CreateCompanyWebhookEndpoint) =>
    api.post<CompanyWebhookEndpointCreated>(API.companyWebhooks(companyId), data),
  update: (companyId: string, webhookId: string, data: UpdateCompanyWebhookEndpoint) =>
    api.patch<CompanyWebhookEndpoint | CompanyWebhookEndpointCreated>(
      API.companyWebhook(companyId, webhookId),
      data,
    ),
  remove: (companyId: string, webhookId: string) =>
    api.delete<void>(API.companyWebhook(companyId, webhookId)),
};
