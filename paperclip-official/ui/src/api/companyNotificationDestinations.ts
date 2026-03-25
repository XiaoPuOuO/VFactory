import type {
  CompanyNotificationDestination,
  CreateCompanyNotificationDestination,
  UpdateCompanyNotificationDestination,
} from "@paperclipai/shared";
import { API } from "@paperclipai/shared";
import { api } from "./client";

export const companyNotificationDestinationsApi = {
  list: (companyId: string) =>
    api.get<CompanyNotificationDestination[]>(API.companyNotificationDestinations(companyId)),
  create: (companyId: string, data: CreateCompanyNotificationDestination) =>
    api.post<CompanyNotificationDestination>(API.companyNotificationDestinations(companyId), data),
  update: (companyId: string, id: string, data: UpdateCompanyNotificationDestination) =>
    api.patch<CompanyNotificationDestination>(API.companyNotificationDestination(companyId, id), data),
  remove: (companyId: string, id: string) =>
    api.delete<void>(API.companyNotificationDestination(companyId, id)),
  test: (companyId: string, destinationId: string) =>
    api.post<{ ok: true }>(API.companyNotificationDestinationsTest(companyId), { destinationId }),
};
