import { api } from "./client";

export const instanceSettingsApi = {
  getDefaultCompanyPath: () =>
    api.get<{ defaultCompanyPath: string }>("/instance/settings/default-company-path"),
  setDefaultCompanyPath: (defaultCompanyPath: string) =>
    api.put<{ defaultCompanyPath: string }>("/instance/settings/default-company-path", {
      defaultCompanyPath,
    }),
};
