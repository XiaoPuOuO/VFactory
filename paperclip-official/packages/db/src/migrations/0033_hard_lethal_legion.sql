CREATE TABLE "company_plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_plugins" ADD CONSTRAINT "company_plugins_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_plugins_company_idx" ON "company_plugins" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_plugins_company_plugin_uq" ON "company_plugins" USING btree ("company_id","plugin_id");