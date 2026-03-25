import { z } from "zod";

export const portabilityIncludeSchema = z
  .object({
    company: z.boolean().optional(),
    agents: z.boolean().optional(),
    approvalPolicies: z.boolean().optional(),
    budgetPolicies: z.boolean().optional(),
  })
  .partial();

export const portabilitySecretRequirementSchema = z.object({
  key: z.string().min(1),
  description: z.string().nullable(),
  agentSlug: z.string().min(1).nullable(),
  providerHint: z.string().nullable(),
});

export const portabilityCompanyManifestEntrySchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  brandColor: z.string().nullable(),
  requireBoardApprovalForNewAgents: z.boolean(),
});

export const portabilityAgentManifestEntrySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  role: z.string().min(1),
  title: z.string().nullable(),
  icon: z.string().nullable(),
  capabilities: z.string().nullable(),
  reportsToSlug: z.string().min(1).nullable(),
  adapterType: z.string().min(1),
  adapterConfig: z.record(z.unknown()),
  runtimeConfig: z.record(z.unknown()),
  permissions: z.record(z.unknown()),
  budgetMonthlyCents: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).nullable(),
});

export const portabilityApprovalPolicyEntrySchema = z.object({
  approvalType: z.string().min(1),
  enabled: z.boolean(),
  maxBudgetMonthlyCents: z.number().int().nullable(),
});

export const portabilityBudgetPolicyEntrySchema = z.object({
  scopeType: z.enum(["project", "billing_code", "company"]),
  /** 匯出時之專案名稱，匯入時依名稱對應目標公司專案 */
  projectName: z.string().min(1).nullable().optional(),
  billingCode: z.string().nullable().optional(),
  limitCents: z.number().int().nonnegative(),
  period: z.string().min(1),
  onExceed: z.enum(["record_only", "block_new_runs_for_scope", "pause_agents"]),
  enabled: z.boolean(),
});

export const portabilityManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  source: z
    .object({
      companyId: z.string().uuid(),
      companyName: z.string().min(1),
    })
    .nullable(),
  includes: z
    .object({
      company: z.boolean(),
      agents: z.boolean(),
      approvalPolicies: z.boolean().optional(),
      budgetPolicies: z.boolean().optional(),
    })
    .transform((inc) => ({
      company: inc.company,
      agents: inc.agents,
      approvalPolicies: inc.approvalPolicies ?? false,
      budgetPolicies: inc.budgetPolicies ?? false,
    })),
  company: portabilityCompanyManifestEntrySchema.nullable(),
  agents: z.array(portabilityAgentManifestEntrySchema),
  approvalPolicies: z.array(portabilityApprovalPolicyEntrySchema).optional(),
  budgetPolicies: z.array(portabilityBudgetPolicyEntrySchema).optional(),
  requiredSecrets: z.array(portabilitySecretRequirementSchema).default([]),
});

export const portabilitySourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inline"),
    manifest: portabilityManifestSchema,
    files: z.record(z.string()),
  }),
  z.object({
    type: z.literal("url"),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal("github"),
    url: z.string().url(),
  }),
]);

export const portabilityTargetSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("new_company"),
    newCompanyName: z.string().min(1).optional().nullable(),
  }),
  z.object({
    mode: z.literal("existing_company"),
    companyId: z.string().uuid(),
  }),
]);

export const portabilityAgentSelectionSchema = z.union([
  z.literal("all"),
  z.array(z.string().min(1)),
]);

export const portabilityCollisionStrategySchema = z.enum(["rename", "skip", "replace"]);

export const companyPortabilityExportSchema = z.object({
  include: portabilityIncludeSchema.optional(),
});

export type CompanyPortabilityExport = z.infer<typeof companyPortabilityExportSchema>;

export const companyPortabilityPreviewSchema = z.object({
  source: portabilitySourceSchema,
  include: portabilityIncludeSchema.optional(),
  target: portabilityTargetSchema,
  agents: portabilityAgentSelectionSchema.optional(),
  collisionStrategy: portabilityCollisionStrategySchema.optional(),
});

export type CompanyPortabilityPreview = z.infer<typeof companyPortabilityPreviewSchema>;

export const companyPortabilityImportSchema = companyPortabilityPreviewSchema;

export type CompanyPortabilityImport = z.infer<typeof companyPortabilityImportSchema>;
