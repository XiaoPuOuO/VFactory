ALTER TABLE "chat_rooms" ADD COLUMN IF NOT EXISTS "composer_project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;
