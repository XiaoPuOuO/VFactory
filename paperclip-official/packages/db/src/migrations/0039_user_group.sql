-- user 表新增 group 欄位：對應 instance_groups.name，用於 instance 身分組權限解析
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "group" text;
