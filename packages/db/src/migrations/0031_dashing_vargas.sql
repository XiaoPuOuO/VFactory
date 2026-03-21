CREATE TABLE "budget_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"project_id" uuid,
	"billing_code" text,
	"limit_cents" integer NOT NULL,
	"period" text DEFAULT 'calendar_month_utc' NOT NULL,
	"on_exceed" text DEFAULT 'record_only' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_policies_company_idx" ON "budget_policies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "budget_policies_company_project_idx" ON "budget_policies" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "budget_policies_company_billing_idx" ON "budget_policies" USING btree ("company_id","billing_code");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_policies_company_scope_uq" ON "budget_policies" USING btree ("company_id") WHERE "budget_policies"."scope_type" = 'company';--> statement-breakpoint
CREATE UNIQUE INDEX "budget_policies_project_scope_uq" ON "budget_policies" USING btree ("company_id","project_id") WHERE "budget_policies"."scope_type" = 'project' AND "budget_policies"."project_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_policies_billing_scope_uq" ON "budget_policies" USING btree ("company_id","billing_code") WHERE "budget_policies"."scope_type" = 'billing_code' AND "budget_policies"."billing_code" IS NOT NULL;