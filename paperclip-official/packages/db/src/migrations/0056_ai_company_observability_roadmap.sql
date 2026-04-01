-- Application logs (queryable; separate from activity_log OLTP semantics)
CREATE TABLE IF NOT EXISTS application_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  level text NOT NULL,
  message text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS application_log_entries_company_created_idx
  ON application_log_entries (company_id, created_at DESC);

-- Versioned roadmap documents (CEO / planning agent output)
CREATE TABLE IF NOT EXISTS roadmap_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL DEFAULT '',
  content_markdown text NOT NULL DEFAULT '',
  created_by_user_id text,
  parent_version_id uuid REFERENCES roadmap_versions(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, version)
);
CREATE INDEX IF NOT EXISTS roadmap_versions_company_created_idx
  ON roadmap_versions (company_id, created_at DESC);

-- Human override of roadmap (JSON Patch RFC 6902 payload; preview before apply)
CREATE TABLE IF NOT EXISTS roadmap_human_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  patch_json jsonb NOT NULL,
  preview_hash text NOT NULL,
  applied_at timestamptz,
  applied_by_user_id text,
  rejected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id text
);
CREATE INDEX IF NOT EXISTS roadmap_human_overrides_company_status_idx
  ON roadmap_human_overrides (company_id, status, created_at DESC);
