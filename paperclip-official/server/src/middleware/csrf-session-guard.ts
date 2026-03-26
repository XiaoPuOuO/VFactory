import type { Request, RequestHandler } from "express";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function firstHeaderValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.split(",")[0]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseOriginFromHeader(raw: string | undefined): string | null {
  const value = firstHeaderValue(raw);
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getEffectiveRequestOrigin(req: Request): string | null {
  const host = firstHeaderValue(req.header("x-forwarded-host") ?? undefined) ?? req.header("host");
  if (!host) return null;
  const proto = firstHeaderValue(req.header("x-forwarded-proto") ?? undefined) ?? req.protocol;
  return `${proto}://${host}`;
}

function getRequestSourceOrigin(req: Request): string | null {
  const originHeader = parseOriginFromHeader(req.header("origin") ?? undefined);
  if (originHeader) return originHeader;
  const refererHeader = parseOriginFromHeader(req.header("referer") ?? undefined);
  if (refererHeader) return refererHeader;
  return null;
}

export function csrfSessionGuard(): RequestHandler {
  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }
    if (req.actor.type !== "board" || req.actor.source !== "session") {
      next();
      return;
    }

    const sourceOrigin = getRequestSourceOrigin(req);
    const expectedOrigin = getEffectiveRequestOrigin(req);
    if (!sourceOrigin || !expectedOrigin || sourceOrigin !== expectedOrigin) {
      res.status(403).json({ error: "CSRF validation failed" });
      return;
    }

    next();
  };
}

