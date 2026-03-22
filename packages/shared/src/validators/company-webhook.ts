import { z } from "zod";
import { COMPANY_WEBHOOK_EVENT_TYPES } from "../constants.js";

const webhookEventEnum = z.enum(
  COMPANY_WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]],
);

const webhookUrlSchema = z.string().refine(
  (u) => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === "https:") return true;
      if (parsed.protocol === "http:") {
        const h = parsed.hostname;
        return h === "127.0.0.1" || h === "localhost";
      }
      return false;
    } catch {
      return false;
    }
  },
  { message: "URL must be https: or http://127.0.0.1 / http://localhost" },
);

export const createCompanyWebhookEndpointSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  url: webhookUrlSchema,
  enabled: z.boolean().optional(),
  eventSubscriptions: z.array(webhookEventEnum).min(1, "Select at least one event type"),
});

export type CreateCompanyWebhookEndpoint = z.infer<typeof createCompanyWebhookEndpointSchema>;

export const updateCompanyWebhookEndpointSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  url: webhookUrlSchema.optional(),
  enabled: z.boolean().optional(),
  eventSubscriptions: z.array(webhookEventEnum).min(1).optional(),
  /** 若提供則重設簽章金鑰並回傳新明文一次 */
  rotateSecret: z.boolean().optional(),
});

export type UpdateCompanyWebhookEndpoint = z.infer<typeof updateCompanyWebhookEndpointSchema>;
