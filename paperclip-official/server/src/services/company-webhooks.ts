import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyWebhookEndpoints } from "@paperclipai/db";
import type {
  CompanyWebhookEndpoint,
  CompanyWebhookEndpointCreated,
  CompanyWebhookEventType,
  CreateCompanyWebhookEndpoint,
  UpdateCompanyWebhookEndpoint,
} from "@paperclipai/shared";
import { logger } from "../middleware/logger.js";

const WEBHOOK_TIMEOUT_MS = 10_000;

function generateSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signWebhookBody(signingSecret: string, rawBody: string): string {
  return createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("hex");
}

function mapRow(
  row: typeof companyWebhookEndpoints.$inferSelect,
): CompanyWebhookEndpoint {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
    eventSubscriptions: row.eventSubscriptions as CompanyWebhookEndpoint["eventSubscriptions"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function companyWebhookService(db: Db) {
  return {
    list: async (companyId: string): Promise<CompanyWebhookEndpoint[]> => {
      const rows = await db
        .select()
        .from(companyWebhookEndpoints)
        .where(eq(companyWebhookEndpoints.companyId, companyId));
      return rows.map(mapRow);
    },

    create: async (
      companyId: string,
      input: CreateCompanyWebhookEndpoint,
    ): Promise<CompanyWebhookEndpointCreated> => {
      const signingSecret = generateSigningSecret();
      const name = input.name?.trim() || "Webhook";
      const [row] = await db
        .insert(companyWebhookEndpoints)
        .values({
          companyId,
          name,
          url: input.url,
          signingSecret,
          enabled: input.enabled ?? true,
          eventSubscriptions: [...input.eventSubscriptions],
          updatedAt: new Date(),
        })
        .returning();
      if (!row) throw new Error("Failed to create webhook endpoint");
      return { ...mapRow(row), signingSecret };
    },

    update: async (
      companyId: string,
      id: string,
      input: UpdateCompanyWebhookEndpoint,
    ): Promise<{ endpoint: CompanyWebhookEndpoint; signingSecret?: string } | null> => {
      const existing = await db
        .select()
        .from(companyWebhookEndpoints)
        .where(
          and(eq(companyWebhookEndpoints.id, id), eq(companyWebhookEndpoints.companyId, companyId)),
        )
        .then((r) => r[0] ?? null);
      if (!existing) return null;

      let nextSecret: string | undefined;
      const patch: Partial<typeof companyWebhookEndpoints.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.name !== undefined) patch.name = input.name.trim() || "Webhook";
      if (input.url !== undefined) patch.url = input.url;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.eventSubscriptions !== undefined) patch.eventSubscriptions = [...input.eventSubscriptions];
      if (input.rotateSecret === true) {
        nextSecret = generateSigningSecret();
        patch.signingSecret = nextSecret;
      }

      const [row] = await db
        .update(companyWebhookEndpoints)
        .set(patch)
        .where(
          and(eq(companyWebhookEndpoints.id, id), eq(companyWebhookEndpoints.companyId, companyId)),
        )
        .returning();
      if (!row) return null;
      return { endpoint: mapRow(row), signingSecret: nextSecret };
    },

    delete: async (companyId: string, id: string): Promise<boolean> => {
      const deleted = await db
        .delete(companyWebhookEndpoints)
        .where(
          and(eq(companyWebhookEndpoints.id, id), eq(companyWebhookEndpoints.companyId, companyId)),
        )
        .returning({ id: companyWebhookEndpoints.id });
      return deleted.length > 0;
    },

    /**
     * 非同步送出：請求路徑內應 `void emit(...).catch(...)` 避免未處理 rejection。
     */
    emit: async (
      companyId: string,
      event: CompanyWebhookEventType,
      payload: Record<string, unknown>,
    ): Promise<void> => {
      const rows = await db
        .select()
        .from(companyWebhookEndpoints)
        .where(eq(companyWebhookEndpoints.companyId, companyId));

      const targets = rows.filter(
        (r) =>
          r.enabled &&
          (r.eventSubscriptions as string[]).includes(event),
      );
      if (targets.length === 0) return;

      const occurredAt = new Date().toISOString();
      const idempotencyKey = randomUUID();

      await Promise.allSettled(
        targets.map(async (endpoint) => {
          const envelope = {
            event,
            companyId,
            occurredAt,
            idempotencyKey,
            payload,
          };
          const rawBody = JSON.stringify(envelope);
          const sig = signWebhookBody(endpoint.signingSecret, rawBody);
          try {
            const res = await fetch(endpoint.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Paperclip-Signature": `sha256=${sig}`,
                "X-Paperclip-Webhook-Id": endpoint.id,
                "X-Paperclip-Event": event,
              },
              body: rawBody,
              signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
            });
            if (!res.ok) {
              logger.warn(
                { webhookId: endpoint.id, status: res.status, event },
                "company webhook delivery returned non-OK",
              );
            }
          } catch (err) {
            logger.warn({ err, webhookId: endpoint.id, event }, "company webhook delivery failed");
          }
        }),
      );
    },
  };
}

export type CompanyWebhookService = ReturnType<typeof companyWebhookService>;

/** 請求處理程式內呼叫：不 await，失敗僅記錄 log。 */
export function scheduleCompanyWebhookEmit(
  db: Db,
  companyId: string,
  event: CompanyWebhookEventType,
  payload: Record<string, unknown>,
): void {
  void companyWebhookService(db)
    .emit(companyId, event, payload)
    .catch((err) => {
      logger.warn({ err, companyId, event }, "company webhook emit failed");
    });
}
