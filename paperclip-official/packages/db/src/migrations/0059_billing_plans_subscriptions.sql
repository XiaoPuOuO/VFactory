CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"entitlements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"external_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"interval_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_unique_idx" ON "plans" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE "company_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"payment_provider" text NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"external_customer_id" text,
	"external_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "company_subscriptions_company_unique_idx" ON "company_subscriptions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "company_subscriptions_company_idx" ON "company_subscriptions" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "company_subscriptions_status_idx" ON "company_subscriptions" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "billing_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_webhook_events_provider_event_idx" ON "billing_webhook_events" USING btree ("provider","external_event_id");
--> statement-breakpoint
CREATE TABLE "billing_invoice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"invoice_provider" text NOT NULL,
	"status" text NOT NULL,
	"request_payload" jsonb,
	"response_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "billing_invoice_attempts_company_idx" ON "billing_invoice_attempts" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "billing_invoice_attempts" ADD CONSTRAINT "billing_invoice_attempts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_invoice_attempts" ADD CONSTRAINT "billing_invoice_attempts_subscription_id_company_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."company_subscriptions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "plans" ("slug", "name", "description", "entitlements", "external_refs", "interval_days", "active", "sort_order")
VALUES
  ('free', 'Free', '預設免費方案', '{"tokenLimit": 100000, "priceLimitCents": 5000}'::jsonb, '{}'::jsonb, 365, true, 0),
  ('pro', 'Pro', '專業方案', '{"tokenLimit": 10000000, "priceLimitCents": 500000}'::jsonb, '{}'::jsonb, 30, true, 10)
ON CONFLICT ("slug") DO NOTHING;
