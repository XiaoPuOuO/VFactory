-- SaaS 多租戶：新增 tenants、tenant_memberships，companies 歸屬租戶，並遷移既有資料至預設租戶。

-- 1. 建立 tenants 表
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_unique_idx" ON "tenants" USING btree ("slug");

-- 2. 建立預設租戶（供既有 companies 與使用者使用）
INSERT INTO "tenants" ("id", "slug", "name", "status", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'default', 'Default', 'active', now(), now())
ON CONFLICT ("slug") DO NOTHING;

-- 3. companies 新增 tenant_id（先 nullable，回填後改 NOT NULL）
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
UPDATE "companies" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenant_id" IS NULL;
ALTER TABLE "companies" ALTER COLUMN "tenant_id" SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'companies' AND constraint_name = 'companies_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- 4. issue_prefix 改為 (tenant_id, issue_prefix) 唯一
DROP INDEX IF EXISTS "companies_issue_prefix_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "companies_tenant_issue_prefix_idx" ON "companies" USING btree ("tenant_id", "issue_prefix");

-- 5. 建立 tenant_memberships 表
CREATE TABLE IF NOT EXISTS "tenant_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_memberships_tenant_user_unique_idx" ON "tenant_memberships" USING btree ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_tenant_idx" ON "tenant_memberships" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_memberships_user_idx" ON "tenant_memberships" USING btree ("user_id");

-- 6. 將既有使用者加入預設租戶（先全部以 member 寫入，再將 instance_admin 升為 owner）
INSERT INTO "tenant_memberships" ("id", "tenant_id", "user_id", "role", "created_at", "updated_at")
SELECT gen_random_uuid(), t.id, u.uid, 'member', now(), now()
FROM (
  SELECT DISTINCT "principal_id" AS uid FROM "company_memberships" WHERE "principal_type" = 'user'
  UNION
  SELECT DISTINCT "user_id" AS uid FROM "instance_user_roles"
) u
CROSS JOIN (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) t
ON CONFLICT ("tenant_id", "user_id") DO NOTHING;

UPDATE "tenant_memberships" tm
SET "role" = 'owner', "updated_at" = now()
FROM "tenants" t, "instance_user_roles" iur
WHERE t."slug" = 'default' AND tm."tenant_id" = t."id" AND tm."user_id" = iur."user_id" AND iur."role" = 'instance_admin';
