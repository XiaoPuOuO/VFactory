CREATE TABLE "company_webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text DEFAULT 'Webhook' NOT NULL,
	"url" text NOT NULL,
	"signing_secret" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_subscriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_webhook_endpoints" ADD CONSTRAINT "company_webhook_endpoints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_webhook_endpoints_company_idx" ON "company_webhook_endpoints" USING btree ("company_id");