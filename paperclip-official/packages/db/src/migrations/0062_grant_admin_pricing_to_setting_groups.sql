-- 已具 admin.setting 的身分組自動取得 admin.pricing，升級後仍可管理方案目錄（與 * 超級權限無關，* 已涵蓋全部）。
INSERT INTO "instance_group_permissions" ("group_id", "permission_key", "created_at", "updated_at")
SELECT DISTINCT igp."group_id", 'admin.pricing', now(), now()
FROM "instance_group_permissions" igp
WHERE igp."permission_key" = 'admin.setting'
  AND NOT EXISTS (
    SELECT 1
    FROM "instance_group_permissions" x
    WHERE x."group_id" = igp."group_id"
      AND (x."permission_key" = 'admin.pricing' OR x."permission_key" = '*')
  );
