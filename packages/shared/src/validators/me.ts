import { z } from "zod";

/** 更新目前使用者的開發者模式（僅允許本人切換 true/false）。 */
export const updateMeDeveloperModeSchema = z.object({
  developerMode: z.boolean(),
});

export type UpdateMeDeveloperMode = z.infer<typeof updateMeDeveloperModeSchema>;

