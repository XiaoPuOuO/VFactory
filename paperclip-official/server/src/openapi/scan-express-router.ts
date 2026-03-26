import type { Router } from "express";
import type { ZodSchema } from "zod";

type ScannedRoute = {
  method: string;
  expressPath: string;
  pathParams: string[];
  requestBodySchema?: ZodSchema;
};

type ZodMiddlewareHandle = {
  __paperclip_zod_schema?: ZodSchema;
};

function joinPaths(a: string, b: string): string {
  const left = a.endsWith("/") ? a.slice(0, -1) : a;
  const right = b.startsWith("/") ? b : `/${b}`;
  return `${left}${right}`;
}

function expressParamsToNames(expressPath: string): string[] {
  const matches = expressPath.match(/:([A-Za-z0-9_-]+)/g) ?? [];
  return matches.map((m) => m.slice(1));
}

function normalizeExpressPath(p: string): string {
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

function getLayerMountPath(layer: unknown): string | null {
  const maybe = layer as { path?: unknown } | undefined;
  if (typeof maybe?.path === "string") return normalizeExpressPath(maybe.path);
  if (Array.isArray(maybe?.path) && maybe.path.length > 0 && typeof maybe.path[0] === "string") {
    return normalizeExpressPath(maybe.path[0]);
  }
  const regexpSource = (layer as any)?.regexp?.source;
  if (typeof regexpSource === "string") {
    // e.g. for `api.use('/v1', router)` the regexp source usually contains escaped literal segments.
    // We extract "v1" (and other literal path segments) and rebuild a best-effort mount path.
    const unescaped = regexpSource.replace(/\\\//g, "/");
    const segmentsFromStart = unescaped.match(/^\/?([A-Za-z0-9_-]+)/)?.[1] ? [unescaped.match(/^\/?([A-Za-z0-9_-]+)/)![1]] : [];
    const segmentsFromSlashes = Array.from(unescaped.matchAll(/\/([A-Za-z0-9_-]+)/g)).map((m) => m[1]).filter(Boolean);
    const segments = [...segmentsFromStart, ...segmentsFromSlashes];
    const deduped: string[] = [];
    for (const s of segments) {
      if (!deduped.includes(s)) deduped.push(s);
    }
    if (deduped.length > 0) {
      return normalizeExpressPath(`/${deduped.join("/")}`);
    }
  }
  return null;
}

function getRoutePath(route: unknown): string | null {
  const maybe = route as { path?: unknown } | undefined;
  if (typeof maybe?.path === "string") return normalizeExpressPath(maybe.path);
  return null;
}

function findZodSchemaInRouteStack(routeStack: Array<{ handle?: unknown }>): ZodSchema | undefined {
  for (const entry of routeStack) {
    const handle = entry.handle as ZodMiddlewareHandle | undefined;
    const schema = handle?.__paperclip_zod_schema;
    if (schema) return schema;
  }
  return undefined;
}

function scanRouterStack(
  router: unknown,
  basePath: string,
  acc: Map<string, ScannedRoute>,
  options: { recurseNestedRouters: boolean; visited: WeakSet<object> },
) {
  const isObjectLike = (typeof router === "function") || (typeof router === "object" && router !== null);
  if (isObjectLike) {
    const routerObj = router as unknown as object;
    if (options.visited.has(routerObj)) return;
    options.visited.add(routerObj);
  }

  const r = router as { stack?: Array<unknown> } | undefined;
  const stack = r?.stack;
  if (!Array.isArray(stack)) return;

  for (const layer of stack) {
    const anyLayer = layer as any;

    if (anyLayer?.route) {
      const routePath = getRoutePath(anyLayer.route);
      if (!routePath) continue;

      const methods = anyLayer.route.methods as Record<string, boolean> | undefined;
      if (!methods) continue;

      const fullExpressPath = joinPaths(basePath, routePath);
      const pathParams = expressParamsToNames(routePath);

      const requestBodySchema = findZodSchemaInRouteStack(anyLayer.route.stack ?? []);

      const truthyMethods = Object.keys(methods).filter((m) => methods[m]);
      for (const methodRaw of truthyMethods) {
        const method = methodRaw.toUpperCase();
        const key = `${method} ${fullExpressPath}`;
        acc.set(key, {
          method,
          expressPath: fullExpressPath,
          pathParams,
          requestBodySchema,
        });
      }
      continue;
    }

    if (!options.recurseNestedRouters) continue;

    const mountPath = getLayerMountPath(layer);
    const nestedRouter = anyLayer?.handle as Router | undefined;
    const nestedStack = (nestedRouter as any)?.stack;
    const isRouterLike = Array.isArray(nestedStack);
    if (isRouterLike) {
      const nextBase = mountPath ? joinPaths(basePath, mountPath) : basePath;
      scanRouterStack(nestedRouter, nextBase, acc, options);
    }
  }
}

export function scanExpressRouter(
  router: Router,
  options: { apiPrefix: string; recurseNestedRouters?: boolean },
): ScannedRoute[] {
  const acc = new Map<string, ScannedRoute>();
  const visited = new WeakSet<object>();
  scanRouterStack(router, normalizeExpressPath(options.apiPrefix), acc, {
    recurseNestedRouters: options.recurseNestedRouters ?? true,
    visited,
  });
  return Array.from(acc.values());
}

