CREATE TABLE "limit_breach_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount_cents" integer,
	"token_usage" bigint,
	"agent_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "auto_pause_reason" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "token_limit" bigint;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "price_limit_cents" integer;--> statement-breakpoint
ALTER TABLE "limit_breach_events" ADD CONSTRAINT "limit_breach_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_breach_events" ADD CONSTRAINT "limit_breach_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "limit_breach_events_company_occurred_idx" ON "limit_breach_events" USING btree ("company_id","occurred_at");