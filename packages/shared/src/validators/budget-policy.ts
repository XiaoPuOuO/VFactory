import { z } from "zod";
import {
  BUDGET_POLICY_ON_EXCEED,
  BUDGET_POLICY_PERIODS,
  BUDGET_POLICY_SCOPE_TYPES,
} from "../constants.js";

const scopeTuple = BUDGET_POLICY_SCOPE_TYPES as unknown as [string, ...string[]];
const periodTuple = BUDGET_POLICY_PERIODS as unknown as [string, ...string[]];
const onExceedTuple = BUDGET_POLICY_ON_EXCEED as unknown as [string, ...string[]];

export const createBudgetPolicySchema = z.object({
  scopeType: z.enum(scopeTuple),
  projectId: z.string().uuid().optional().nullable(),
  billingCode: z.string().optional().nullable(),
  limitCents: z.number().int().nonnegative(),
  period: z.enum(periodTuple).optional(),
  onExceed: z.enum(onExceedTuple).optional(),
  enabled: z.boolean().optional(),
});

export const updateBudgetPolicySchema = z.object({
  limitCents: z.number().int().nonnegative().optional(),
  onExceed: z.enum(onExceedTuple).optional(),
  enabled: z.boolean().optional(),
});

export type CreateBudgetPolicy = z.infer<typeof createBudgetPolicySchema>;
export type UpdateBudgetPolicy = z.infer<typeof updateBudgetPolicySchema>;
