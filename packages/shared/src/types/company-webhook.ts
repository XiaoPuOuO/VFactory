import type { CompanyWebhookEventType } from "../constants.js";

export interface CompanyWebhookEndpoint {
  id: string;
  companyId: string;
  name: string;
  url: string;
  enabled: boolean;
  eventSubscriptions: CompanyWebhookEventType[];
  createdAt: Date;
  updatedAt: Date;
}

/** 建立成功時一次性回傳簽章用密鑰（之後僅能重設）。 */
export interface CompanyWebhookEndpointCreated extends CompanyWebhookEndpoint {
  signingSecret: string;
}
