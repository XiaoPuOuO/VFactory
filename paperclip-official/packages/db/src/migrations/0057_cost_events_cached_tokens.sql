ALTER TABLE "cost_events" ADD COLUMN "cached_read_tokens" integer DEFAULT 0 NOT NULL;
ALTER TABLE "cost_events" ADD COLUMN "cached_write_tokens" integer DEFAULT 0 NOT NULL;
