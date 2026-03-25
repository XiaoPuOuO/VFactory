import { z } from "zod";
import { HEARTBEAT_INVOCATION_SOURCES, HEARTBEAT_RUN_STATUSES } from "../constants.js";

const statusSet = new Set<string>(HEARTBEAT_RUN_STATUSES);
const invocationSet = new Set<string>(HEARTBEAT_INVOCATION_SOURCES);

function parseStatuses(raw: string | undefined): (typeof HEARTBEAT_RUN_STATUSES)[number][] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!statusSet.has(p)) return undefined;
  }
  return parts as (typeof HEARTBEAT_RUN_STATUSES)[number][];
}

function parseInvocations(raw: string | undefined): (typeof HEARTBEAT_INVOCATION_SOURCES)[number][] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!invocationSet.has(p)) return undefined;
  }
  return parts as (typeof HEARTBEAT_INVOCATION_SOURCES)[number][];
}

export const heartbeatRunsListQuerySchema = z.object({
  agentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  startedAfter: z.coerce.date().optional(),
  endedBefore: z.coerce.date().optional(),
  /** 逗號分隔，多個 HEARTBEAT_RUN_STATUSES */
  status: z.string().optional(),
  /** 逗號分隔，多個 HEARTBEAT_INVOCATION_SOURCES */
  invocationSource: z.string().optional(),
  /** base64url(JSON.stringify({ createdAt: ISO string, id: uuid })) */
  cursor: z.string().optional(),
});

export type HeartbeatRunsListQuery = z.infer<typeof heartbeatRunsListQuerySchema>;

export function parseHeartbeatRunsListStatuses(
  raw: string | undefined,
): (typeof HEARTBEAT_RUN_STATUSES)[number][] | undefined {
  return parseStatuses(raw);
}

export function parseHeartbeatRunsListInvocationSources(
  raw: string | undefined,
): (typeof HEARTBEAT_INVOCATION_SOURCES)[number][] | undefined {
  return parseInvocations(raw);
}

export const heartbeatRunsQualityQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type HeartbeatRunsQualityQuery = z.infer<typeof heartbeatRunsQualityQuerySchema>;

export const scheduleConflictsQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(30).optional().default(7),
  thresholdSec: z.coerce.number().int().min(1).max(3600).optional().default(60),
});

export type ScheduleConflictsQuery = z.infer<typeof scheduleConflictsQuerySchema>;

function utf8ToBase64Url(json: string): string {
  const data = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeHeartbeatRunCursor(createdAt: Date, id: string): string {
  return utf8ToBase64Url(JSON.stringify({ createdAt: createdAt.toISOString(), id }));
}

export function decodeHeartbeatRunCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = base64UrlToUtf8(cursor);
    const parsed = JSON.parse(raw) as { createdAt?: string; id?: string };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    const d = new Date(parsed.createdAt);
    if (!Number.isFinite(d.getTime())) return null;
    return { createdAt: d, id: parsed.id };
  } catch {
    return null;
  }
}
