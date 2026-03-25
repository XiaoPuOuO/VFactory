import { z } from "zod";

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const browserUseEnvelopeSchema = z.object({
  agentId: boundedString(128),
  runId: boundedString(128),
  taskKey: z.string().trim().min(1).max(256).optional().nullable(),
});

export const browserUseStartSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    headless: z.boolean().optional(),
    allowedDomains: z.array(boundedString(255)).max(50).optional(),
    sessionTtlSec: z.number().int().min(30).max(3600).optional(),
  }),
});

export const browserUseNavigateSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
    url: z.string().trim().url().max(2048),
    newTab: z.boolean().optional(),
  }),
});

export const browserUseStateSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
    includeScreenshot: z.boolean().optional(),
  }),
});

const clickByIndexSchema = z.object({
  sessionId: boundedString(256),
  index: z.number().int().min(0),
  newTab: z.boolean().optional(),
});

const clickByCoordinateSchema = z.object({
  sessionId: boundedString(256),
  coordinateX: z.number().int().min(0),
  coordinateY: z.number().int().min(0),
  newTab: z.boolean().optional(),
});

export const browserUseClickSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.union([clickByIndexSchema, clickByCoordinateSchema]),
});

export const browserUseTypeSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
    index: z.number().int().min(0),
    text: z.string().max(4000),
  }),
});

export const browserUseExtractSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
    query: z.string().trim().min(1).max(2000),
    extractLinks: z.boolean().optional(),
  }),
});

export const browserUseScreenshotSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
    fullPage: z.boolean().optional(),
  }),
});

export const browserUseCloseSchema = browserUseEnvelopeSchema.extend({
  toolInput: z.object({
    sessionId: boundedString(256),
  }),
});

export type BrowserUseStartInput = z.infer<typeof browserUseStartSchema>;
export type BrowserUseNavigateInput = z.infer<typeof browserUseNavigateSchema>;
export type BrowserUseStateInput = z.infer<typeof browserUseStateSchema>;
export type BrowserUseClickInput = z.infer<typeof browserUseClickSchema>;
export type BrowserUseTypeInput = z.infer<typeof browserUseTypeSchema>;
export type BrowserUseExtractInput = z.infer<typeof browserUseExtractSchema>;
export type BrowserUseScreenshotInput = z.infer<typeof browserUseScreenshotSchema>;
export type BrowserUseCloseInput = z.infer<typeof browserUseCloseSchema>;
