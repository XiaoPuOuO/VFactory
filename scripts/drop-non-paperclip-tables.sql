-- 僅刪除「不屬於 Paperclip」的 public schema 表（PostgreSQL）
-- 使用方式：先備份 DB，再執行
--   psql "$DATABASE_URL" -f scripts/drop-non-paperclip-tables.sql
--
-- Paperclip 表白名單來自 packages/db/src/migrations（與 __drizzle_migrations）

DO $$
DECLARE
  r RECORD;
  paperclip_tables text[] := ARRAY[
    '__drizzle_migrations',
    'account',
    'activity_log',
    'agent_api_keys',
    'agent_config_revisions',
    'agent_runtime_state',
    'agent_schedules',
    'agent_task_sessions',
    'agent_wakeup_requests',
    'agents',
    'approval_comments',
    'approvals',
    'assets',
    'chat_list_preferences',
    'chat_messages',
    'chat_room_members',
    'chat_rooms',
    'companies',
    'company_memberships',
    'company_secret_versions',
    'company_secrets',
    'cost_events',
    'goals',
    'heartbeat_run_events',
    'heartbeat_runs',
    'instance_group_permissions',
    'instance_groups',
    'instance_user_groups',
    'instance_user_roles',
    'invites',
    'issue_approvals',
    'issue_attachments',
    'issue_comments',
    'issue_labels',
    'issue_read_states',
    'issues',
    'join_requests',
    'labels',
    'principal_permission_grants',
    'project_goals',
    'project_workspaces',
    'projects',
    'session',
    'tenant_memberships',
    'tenants',
    'user',
    'verification',
    'workspace_runtime_services'
  ];
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> ALL (paperclip_tables)
    ORDER BY tablename
  LOOP
    RAISE NOTICE 'Dropping non-Paperclip table: %', r.tablename;
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
  END LOOP;
END $$;
