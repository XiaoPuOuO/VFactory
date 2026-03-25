CREATE TABLE "company_approval_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"approval_type" text DEFAULT 'hire_agent' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_budget_monthly_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "decision_source" text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "policy_id" uuid;--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "policy_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "company_approval_policies" ADD CONSTRAINT "company_approval_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_approval_policies_company_type_unique_idx" ON "company_approval_policies" USING btree ("company_id","approval_type");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_policy_id_company_approval_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."company_approval_policies"("id") ON DELETE set null ON UPDATE no action;