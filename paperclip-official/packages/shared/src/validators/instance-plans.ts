import { z } from "zod";

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "slug: lowercase letters, digits, underscore, hyphen");

const entitlementsRecord = z.record(z.string(), z.unknown());

export const createInstancePlanSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  entitlements: entitlementsRecord.optional(),
  externalRefs: z.record(z.string(), z.string()).optional(),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  catalogVisible: z.boolean().optional(),
  allowedCompanyIds: z.array(z.string().uuid()).optional(),
});

export const updateInstancePlanSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  entitlements: entitlementsRecord.optional(),
  externalRefs: z.record(z.string(), z.string()).optional(),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  catalogVisible: z.boolean().optional(),
  allowedCompanyIds: z.array(z.string().uuid()).optional(),
});

export type CreateInstancePlanInput = z.infer<typeof createInstancePlanSchema>;
export type UpdateInstancePlanInput = z.infer<typeof updateInstancePlanSchema>;
