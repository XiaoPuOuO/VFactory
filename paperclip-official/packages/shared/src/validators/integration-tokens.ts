import { z } from "zod";
import { isIntegrationTokenScope } from "../constants.js";

export const createIntegrationApiKeySchema = z.object({
  name: z.string().min(1).max(200),
  scopes: z
    .array(z.string().refine(isIntegrationTokenScope, { message: "Invalid integration scope" }))
    .min(1)
    .max(32),
});

export type CreateIntegrationApiKeyInput = z.infer<typeof createIntegrationApiKeySchema>;
