-- Migration: Fix issue_comments, issue_read_states, cost_events FK constraints
-- 修正刪除議題時的外鍵約束問題，加入 ON DELETE CASCADE / SET NULL

ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_issue_id_issues_id_fk";
--> statement-breakpoint
ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_author_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "issue_read_states" DROP CONSTRAINT IF EXISTS "issue_read_states_company_id_companies_id_fk";
--> statement-breakpoint
ALTER TABLE "issue_read_states" DROP CONSTRAINT IF EXISTS "issue_read_states_issue_id_issues_id_fk";
--> statement-breakpoint
ALTER TABLE "cost_events" DROP CONSTRAINT IF EXISTS "cost_events_issue_id_issues_id_fk";
--> statement-breakpoint

ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_read_states" ADD CONSTRAINT "issue_read_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_read_states" ADD CONSTRAINT "issue_read_states_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;