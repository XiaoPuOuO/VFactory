import { z } from "zod";

/** 封禁時長上限：10 年（秒） */
const MAX_BAN_DURATION_SECONDS = 10 * 365.25 * 24 * 60 * 60;

/** 設定使用者的 instance 身分組；null 表示使用預設群組 */
export const setInstanceUserGroupSchema = z.object({
  group: z.string().min(1).max(120).nullable(),
});

export type SetInstanceUserGroup = z.infer<typeof setInstanceUserGroupSchema>;

/** 封禁帳戶；durationSeconds 為 null 表示永久，1～MAX 表示 1 秒～10 年 */
export const banInstanceUserSchema = z.object({
  reason: z.string().min(1, "封禁理由為必填").max(2000),
  durationSeconds: z
    .number()
    .int()
    .min(1, "時長至少 1 秒")
    .max(MAX_BAN_DURATION_SECONDS)
    .nullable(),
});

export type BanInstanceUser = z.infer<typeof banInstanceUserSchema>;

/** 更新使用者顯示名稱 */
export const updateInstanceUserNameSchema = z.object({
  name: z.string().min(1, "名稱為必填").max(256).transform((s) => s.trim()),
});

export type UpdateInstanceUserName = z.infer<typeof updateInstanceUserNameSchema>;
