-- 群組顯示名稱（給使用者看的名稱，與 group id/name 分離）
ALTER TABLE "instance_groups"
  ADD COLUMN IF NOT EXISTS "display_name" text;

-- 群組繼承：子群組可繼承多個父群組的權限
CREATE TABLE IF NOT EXISTS "instance_group_inheritance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "instance_groups"("id") ON DELETE CASCADE,
  "parent_group_id" uuid NOT NULL REFERENCES "instance_groups"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "instance_group_inheritance_no_self" CHECK ("group_id" != "parent_group_id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "instance_group_inheritance_group_parent_unique_idx"
  ON "instance_group_inheritance" USING btree ("group_id", "parent_group_id");
CREATE INDEX IF NOT EXISTS "instance_group_inheritance_group_idx"
  ON "instance_group_inheritance" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "instance_group_inheritance_parent_idx"
  ON "instance_group_inheritance" USING btree ("parent_group_id");
