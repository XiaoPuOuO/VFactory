CREATE TABLE "company_automation_rule_fires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_automation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"trigger" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_notification_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"name" text DEFAULT 'Notification' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"event_subscriptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"created_by_user_id" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_provisioning_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_automation_rule_fires" ADD CONSTRAINT "company_automation_rule_fires_rule_id_company_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."company_automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_automation_rule_fires" ADD CONSTRAINT "company_automation_rule_fires_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_automation_rules" ADD CONSTRAINT "company_automation_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_notification_destinations" ADD CONSTRAINT "company_notification_destinations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_provisioning_keys" ADD CONSTRAINT "scim_provisioning_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_automation_rule_fires_rule_dedupe_uq" ON "company_automation_rule_fires" USING btree ("rule_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "company_automation_rule_fires_company_idx" ON "company_automation_rule_fires" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_automation_rules_company_idx" ON "company_automation_rules" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_automation_rules_company_sort_idx" ON "company_automation_rules" USING btree ("company_id","sort_order");--> statement-breakpoint
CREATE INDEX "company_notification_destinations_company_idx" ON "company_notification_destinations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_subscriptions_issue_user_uq" ON "issue_subscriptions" USING btree ("issue_id","user_id");--> statement-breakpoint
CREATE INDEX "issue_subscriptions_company_idx" ON "issue_subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "issue_subscriptions_issue_idx" ON "issue_subscriptions" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "integration_api_keys_key_hash_idx" ON "integration_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "integration_api_keys_company_idx" ON "integration_api_keys" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scim_provisioning_keys_key_hash_idx" ON "scim_provisioning_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "scim_provisioning_keys_tenant_idx" ON "scim_provisioning_keys" USING btree ("tenant_id");