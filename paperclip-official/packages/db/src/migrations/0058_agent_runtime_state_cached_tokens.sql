ALTER TABLE "agent_runtime_state" ADD COLUMN "total_cache_read_tokens" bigint DEFAULT 0 NOT NULL;
ALTER TABLE "agent_runtime_state" ADD COLUMN "total_cache_write_tokens" bigint DEFAULT 0 NOT NULL;
