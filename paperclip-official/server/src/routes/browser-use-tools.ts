import crypto from "node:crypto";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  browserUseClickSchema,
  browserUseCloseSchema,
  browserUseExtractSchema,
  browserUseNavigateSchema,
  browserUseScreenshotSchema,
  browserUseStartSchema,
  browserUseStateSchema,
  browserUseTypeSchema,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { getActorInfo } from "./authz.js";
import { logActivity } from "../services/index.js";
import { browserUseGatewayService } from "../services/browser-use-gateway.js";

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

const TOOL_RATE_BUCKETS = new Map<string, RateLimitBucket>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 60;

function assertToolRateLimit(key: string) {
  const now = Date.now();
  const bucket = TOOL_RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.windowStartMs >= RATE_WINDOW_MS) {
    TOOL_RATE_BUCKETS.set(key, { windowStartMs: now, count: 1 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_PER_WINDOW) {
    throw forbidden("browser-use tool rate limit exceeded");
  }
}

function assertBodySizeLimit(value: unknown, maxBytes = 64 * 1024) {
  const size = Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
  if (size > maxBytes) {
    throw forbidden("browser-use payload too large");
  }
}

export function browserUseToolRoutes(db: Db) {
  const router = Router();
  const gateway = browserUseGatewayService();

  function bindRoute(path: string, schema: Parameters<typeof validate>[0], action: Parameters<typeof gateway.invoke>[0]) {
    router.post(path, validate(schema), async (req, res) => {
      assertBodySizeLimit(req.body);
      const actor = getActorInfo(req);
      const traceId = crypto.randomUUID();
      const payload = req.body as {
        agentId: string;
        runId: string;
        taskKey?: string | null;
        toolInput: Record<string, unknown>;
      };
      assertToolRateLimit(`${payload.agentId}:${action}`);
      const result = await gateway.invoke(action, { ...payload, traceId });

      await logActivity(db, {
        companyId:
          req.actor.type === "agent"
            ? (req.actor.companyId ?? "unknown-company")
            : "unknown-company",
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "tool.browser_use_invoked",
        entityType: "agent",
        entityId: payload.agentId,
        details: {
          traceId,
          toolAction: action,
          ok: result.ok,
          errorCode: result.error?.code ?? null,
        },
      });

      if (!result.ok) {
        res.status(502).json(result);
        return;
      }
      res.json(result);
    });
  }

  bindRoute("/tools/browser-use/sessions/start", browserUseStartSchema, "sessions/start");
  bindRoute("/tools/browser-use/navigate", browserUseNavigateSchema, "navigate");
  bindRoute("/tools/browser-use/state", browserUseStateSchema, "state");
  bindRoute("/tools/browser-use/click", browserUseClickSchema, "click");
  bindRoute("/tools/browser-use/type", browserUseTypeSchema, "type");
  bindRoute("/tools/browser-use/extract", browserUseExtractSchema, "extract");
  bindRoute("/tools/browser-use/screenshot", browserUseScreenshotSchema, "screenshot");
  bindRoute("/tools/browser-use/sessions/close", browserUseCloseSchema, "sessions/close");

  return router;
}
