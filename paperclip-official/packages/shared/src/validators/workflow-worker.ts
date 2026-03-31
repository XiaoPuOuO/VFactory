import { z } from "zod";

/**
 * 與 {@link WorkflowStepWorkerResult} 對應；`schemaVersion` 用於往後相容。
 */
export const workflowStepWorkerResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      schemaVersion: z.literal(1),
      status: z.literal("ok"),
      outputs: z.record(z.string(), z.unknown()).optional(),
      message: z.string().max(500_000).optional(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      status: z.literal("error"),
      error: z.string().min(1).max(16_000),
      message: z.string().max(500_000).optional(),
    })
    .strict(),
]);

export type WorkflowStepWorkerResultParsed = z.infer<typeof workflowStepWorkerResultSchema>;
