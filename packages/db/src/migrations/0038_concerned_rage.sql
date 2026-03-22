CREATE TABLE "issue_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_saved_views" ADD CONSTRAINT "issue_saved_views_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_saved_views_company_user_scope_name_uq" ON "issue_saved_views" USING btree ("company_id","user_id","scope_key","name");--> statement-breakpoint
CREATE INDEX "issue_saved_views_company_user_scope_idx" ON "issue_saved_views" USING btree ("company_id","user_id","scope_key");