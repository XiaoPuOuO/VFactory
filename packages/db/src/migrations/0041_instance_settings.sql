-- 此站設定鍵值（例如預設身分組名稱）。user.group 為 null 時使用 default_group 對應的群組權限。
CREATE TABLE IF NOT EXISTS "instance_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "instance_settings" ("key", "value", "created_at", "updated_at")
VALUES ('default_group', 'default', now(), now())
ON CONFLICT ("key") DO NOTHING;
