-- 列出「不屬於 Paperclip」的 public 表（僅查詢，不刪除）
-- 使用方式：psql "$DATABASE_URL" -f scripts/list-non-paperclip-tables.sql
-- 確認名單後再執行 drop-non-paperclip-tables.sql

SELECT tablename AS "會被刪除的表 (非 Paperclip)"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename <> ALL (ARRAY[
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
  ])
ORDER BY tablename;
