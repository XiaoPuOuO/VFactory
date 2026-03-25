-- 移除權限 company.create：改由 company.create.amount.{number} 或 company.create.amount.infinite 決定建立公司能力。
-- 若群組已有 company.create.amount.1，僅刪除 company.create，避免 (group_id, permission_key) 重複。

DELETE FROM "instance_group_permissions" igp
WHERE igp."permission_key" = 'company.create'
  AND EXISTS (
    SELECT 1 FROM "instance_group_permissions" igp2
    WHERE igp2."group_id" = igp."group_id" AND igp2."permission_key" = 'company.create.amount.1'
  );

UPDATE "instance_group_permissions"
SET "permission_key" = 'company.create.amount.1', "updated_at" = now()
WHERE "permission_key" = 'company.create';
