ALTER TABLE "cost_events" ADD COLUMN IF NOT EXISTS "idempotency_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "cost_events_idempotency_key_idx"
  ON "cost_events" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

