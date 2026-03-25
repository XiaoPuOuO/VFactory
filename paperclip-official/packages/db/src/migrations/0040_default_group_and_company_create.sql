-- default 身分組：所有人預設使用此組權限（user.group 為 null 時在 middleware 視為 default）。
-- 建立公司能力僅由 company.create.amount.{number} 或 company.create.amount.infinite 決定；此處預設給予 company.create.amount.1（可建立 1 家）。

INSERT INTO "instance_groups" ("id", "name", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'default', now(), now())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "instance_group_permissions" ("group_id", "permission_key", "created_at", "updated_at")
SELECT g."id", 'company.create.amount.1', now(), now()
FROM "instance_groups" g
WHERE g."name" = 'default'
  AND NOT EXISTS (SELECT 1 FROM "instance_group_permissions" igp WHERE igp."group_id" = g."id" AND igp."permission_key" = 'company.create.amount.1');
