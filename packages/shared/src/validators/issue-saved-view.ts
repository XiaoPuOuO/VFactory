import { z } from "zod";

/** 與 UI `IssueViewState` 對齊，並可選附帶搜尋字串。 */
export const issueSavedViewPayloadSchema = z
  .object({
    statuses: z.array(z.string()),
    priorities: z.array(z.string()),
    assignees: z.array(z.string()),
    labels: z.array(z.string()),
    sortField: z.enum(["status", "priority", "title", "created", "updated"]),
    sortDir: z.enum(["asc", "desc"]),
    groupBy: z.enum(["status", "priority", "assignee", "none"]),
    viewMode: z.enum(["list", "board"]),
    collapsedGroups: z.array(z.string()),
    issueSearch: z.string().optional(),
  })
  .strict();

export type IssueSavedViewPayload = z.infer<typeof issueSavedViewPayloadSchema>;

export const createIssueSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    scopeKey: z.string().trim().min(1).max(512),
    payload: issueSavedViewPayloadSchema,
  })
  .strict();

export type CreateIssueSavedView = z.infer<typeof createIssueSavedViewSchema>;

export const updateIssueSavedViewSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    payload: issueSavedViewPayloadSchema.optional(),
  })
  .strict()
  .refine((b) => b.name !== undefined || b.payload !== undefined, {
    message: "At least one of name or payload is required",
  });

export type UpdateIssueSavedView = z.infer<typeof updateIssueSavedViewSchema>;
