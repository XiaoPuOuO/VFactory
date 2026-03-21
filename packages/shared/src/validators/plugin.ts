import { z } from "zod";
import { BUILTIN_PLUGIN_IDS } from "../constants.js";

export const builtinPluginIdSchema = z.enum(
  BUILTIN_PLUGIN_IDS as unknown as [string, ...string[]],
);

/** PATCH body：至少須更新 enabled 或 config 之一。 */
export const upsertCompanyPluginSchema = z
  .object({
    enabled: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((data) => data.enabled !== undefined || data.config !== undefined, {
    message: "must provide enabled and/or config",
  });

export type UpsertCompanyPlugin = z.infer<typeof upsertCompanyPluginSchema>;
