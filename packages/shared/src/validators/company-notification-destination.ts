import { z } from "zod";
import { COMPANY_WEBHOOK_EVENT_TYPES, NOTIFICATION_CHANNEL_TYPES } from "../constants.js";

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

const emailConfigSchema = z.object({
  smtpHost: z.string().min(1).max(256),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().min(1).max(256),
  smtpPassword: z.string().min(1).max(512),
  fromAddress: z.string().email(),
  /** 廣播型事件（如核准、預算）在無 recipientUserIds 時額外寄送 */
  broadcastToEmails: z.array(z.string().email()).max(32).optional(),
});

const slackDiscordConfigSchema = z.object({
  webhookUrl: webhookUrlSchema,
});

export const createCompanyNotificationDestinationSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("email"),
    name: z.string().min(1).max(128).optional(),
    enabled: z.boolean().optional(),
    eventSubscriptions: z.array(webhookEventEnum).min(1, "Select at least one event type"),
    config: emailConfigSchema,
  }),
  z.object({
    channel: z.literal("slack"),
    name: z.string().min(1).max(128).optional(),
    enabled: z.boolean().optional(),
    eventSubscriptions: z.array(webhookEventEnum).min(1, "Select at least one event type"),
    config: slackDiscordConfigSchema,
  }),
  z.object({
    channel: z.literal("discord"),
    name: z.string().min(1).max(128).optional(),
    enabled: z.boolean().optional(),
    eventSubscriptions: z.array(webhookEventEnum).min(1, "Select at least one event type"),
    config: slackDiscordConfigSchema,
  }),
]);

export type CreateCompanyNotificationDestination = z.infer<
  typeof createCompanyNotificationDestinationSchema
>;

export const updateCompanyNotificationDestinationSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  enabled: z.boolean().optional(),
  eventSubscriptions: z.array(webhookEventEnum).min(1).optional(),
  /** 與既有 config 深併；服務層依 channel 驗證欄位 */
  config: z.record(z.unknown()).optional(),
});

export type UpdateCompanyNotificationDestination = z.infer<
  typeof updateCompanyNotificationDestinationSchema
>;

export const testCompanyNotificationDestinationSchema = z.object({
  destinationId: z.string().uuid().optional(),
  channel: z.enum(NOTIFICATION_CHANNEL_TYPES).optional(),
});

export type TestCompanyNotificationDestination = z.infer<
  typeof testCompanyNotificationDestinationSchema
>;
