-- 身分組（group）與權限：instance_groups、instance_group_permissions、instance_user_groups
-- 權限 company.view.all 可看全部公司；admin 組擁有 *（全部權限）。

-- 1. 身分組表
CREATE TABLE IF NOT EXISTS "instance_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "instance_groups_name_unique_idx" ON "instance_groups" USING btree ("name");

-- 2. 身分組權限（permission_key = '*' 表示該組擁有所有權限）
CREATE TABLE IF NOT EXISTS "instance_group_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "instance_groups"("id") ON DELETE CASCADE,
  "permission_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "instance_group_permissions_group_key_unique_idx" ON "instance_group_permissions" USING btree ("group_id", "permission_key");
CREATE INDEX IF NOT EXISTS "instance_group_permissions_group_idx" ON "instance_group_permissions" USING btree ("group_id");

-- 3. 使用者與身分組關聯
CREATE TABLE IF NOT EXISTS "instance_user_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "instance_groups"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "instance_user_groups_user_group_unique_idx" ON "instance_user_groups" USING btree ("user_id", "group_id");
CREATE INDEX IF NOT EXISTS "instance_user_groups_user_idx" ON "instance_user_groups" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "instance_user_groups_group_idx" ON "instance_user_groups" USING btree ("group_id");

-- 4. 建立 admin 身分組並賦予 * 權限
INSERT INTO "instance_groups" ("id", "name", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'admin', now(), now())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "instance_group_permissions" ("group_id", "permission_key", "created_at", "updated_at")
SELECT g."id", '*', now(), now()
FROM "instance_groups" g
WHERE g."name" = 'admin'
  AND NOT EXISTS (SELECT 1 FROM "instance_group_permissions" igp WHERE igp."group_id" = g."id" AND igp."permission_key" = '*');
