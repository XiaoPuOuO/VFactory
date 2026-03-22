import type { IssueSavedViewPayload } from "../validators/issue-saved-view.js";

export type IssueSavedView = {
  id: string;
  companyId: string;
  userId: string;
  scopeKey: string;
  name: string;
  payload: IssueSavedViewPayload;
  createdAt: string;
  updatedAt: string;
};
