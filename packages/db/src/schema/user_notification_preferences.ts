import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

/** Board 使用者通知偏好（跨公司單一列，與 auth_users.id 對應）。 */
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  userId: text("user_id").primaryKey(),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
