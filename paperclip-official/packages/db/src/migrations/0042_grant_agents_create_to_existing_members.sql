-- Grant agents:create to all existing company members (users) so non-admin can create agents.
INSERT INTO principal_permission_grants (id, company_id, principal_type, principal_id, permission_key, scope, granted_by_user_id, created_at, updated_at)
SELECT gen_random_uuid(), cm.company_id, cm.principal_type, cm.principal_id, 'agents:create', NULL, NULL, now(), now()
FROM company_memberships cm
WHERE cm.principal_type = 'user' AND cm.status = 'active'
AND NOT EXISTS (
  SELECT 1 FROM principal_permission_grants ppg
  WHERE ppg.company_id = cm.company_id
    AND ppg.principal_type = cm.principal_type
    AND ppg.principal_id = cm.principal_id
    AND ppg.permission_key = 'agents:create'
);
