import type { Router } from "express";
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import type { JsonObject } from "swagger-ui-express";
import { z } from "zod";
import type { ZodSchema } from "zod";
import { scanExpressRouter } from "./scan-express-router.js";

extendZodWithOpenApi(z);

function expressPathToOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_-]+)/g, "{$1}");
}

function normalizeOpenApiPath(path: string): string {
  if (path.length <= 1) return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function joinPaths(a: string, b: string): string {
  const left = a.endsWith("/") ? a.slice(0, -1) : a;
  const right = b.startsWith("/") ? b : `/${b}`;
  return `${left}${right}`;
}

function sanitizeComponentKey(input: string): string {
  return input
    .replace(/^\/+/, "")
    .replace(/[{}]/g, "")
    .replace(/[:\/\\.\-]+/g, "_")
    .replace(/_+/g, "_")
    .trim();
}

function buildPathParamsSchema(pathParams: string[]): z.ZodObject<Record<string, z.ZodTypeAny>> | null {
  if (pathParams.length === 0) return null;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const name of pathParams) {
    shape[name] = z.string();
  }
  return z.object(shape);
}

function isCsvExportPath(openApiPath: string): boolean {
  return openApiPath.includes("/export") || openApiPath.endsWith("/export");
}

function errorResponseSchema(): ZodSchema {
  return z
    .object({
      error: z.string(),
      code: z.string().optional(),
      details: z.any().optional(),
    })
    .passthrough();
}

function schemaContainsZodNever(schema: ZodSchema): boolean {
  const seen = new Set<unknown>();

  const visit = (s: unknown): boolean => {
    if (!s || typeof s !== "object") return false;
    if (seen.has(s)) return false;
    seen.add(s);

    const anySchema = s as any;
    const typeName = anySchema?._def?.typeName;
    if (typeName === "ZodNever") return true;

    const def = anySchema?._def;
    if (!def || typeof def !== "object") return false;

    for (const value of Object.values(def)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (visit(item)) return true;
        }
      } else {
        // Only recurse into nested Zod schemas (best-effort by `_def.typeName`).
        const nestedTypeName = (value as any)?._def?.typeName;
        if (typeof nestedTypeName === "string" && nestedTypeName.startsWith("Zod")) {
          if (visit(value)) return true;
        }
      }
    }

    return false;
  };

  return visit(schema);
}

export function createOpenApiDocument(
  targets: Array<{ mountPath: string; router: Router }>,
  options: { apiPrefix: string },
): JsonObject {
  const scanned = targets.flatMap((t) =>
    scanExpressRouter(t.router, {
      apiPrefix: joinPaths(options.apiPrefix, t.mountPath),
      recurseNestedRouters: false,
    }),
  );

  const registry = new OpenAPIRegistry();

  const successJsonResponseSchema = z.any();
  const successCsvResponseSchema = z.string();
  const errorSchema = errorResponseSchema();

  const registeredOperations = new Set<string>();

  for (const route of scanned) {
    const openApiPath = expressPathToOpenApiPath(route.expressPath);
    const normalizedPath = normalizeOpenApiPath(openApiPath);

    if (normalizedPath !== "/api" && !normalizedPath.startsWith("/api/")) continue;

    if (
      normalizedPath === "/api/openapi.json" ||
      normalizedPath === "/api/docs" ||
      normalizedPath.startsWith("/api/docs/")
    )
      continue;

    const method = route.method.toLowerCase();
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

    const params = buildPathParamsSchema(route.pathParams);

    const request: Record<string, unknown> = {};
    if (params) request.params = params;

    if (route.requestBodySchema && !schemaContainsZodNever(route.requestBodySchema)) {
      const componentKey = `RequestBody_${method}_${sanitizeComponentKey(normalizedPath)}`;
      try {
        const registered = registry.register(componentKey, route.requestBodySchema);
        request.body = {
          content: {
            "application/json": { schema: registered },
          },
        };
      } catch (err) {
        // If zod-to-openapi can't map a particular schema type (e.g. ZodNever),
        // omit `requestBody` for that operation so the server can still start.
        console.warn("OpenAPI requestBody skipped for route:", normalizedPath, err);
      }
    }

    const successResponse = isCsvExportPath(normalizedPath)
      ? {
          description: "Success",
          content: {
            "text/csv": { schema: successCsvResponseSchema },
          },
        }
      : {
          description: "Success",
          content: {
            "application/json": { schema: successJsonResponseSchema },
          },
        };

    const errorResponse = {
      description: "Error",
      content: {
        "application/json": { schema: errorSchema },
      },
    };

    const operationKey = `${method.toUpperCase()} ${normalizedPath}`;
    if (registeredOperations.has(operationKey)) continue;
    registeredOperations.add(operationKey);

    registry.registerPath({
      method: method as any,
      path: normalizedPath,
      ...(Object.keys(request).length > 0 ? { request } : {}),
      responses: {
        200: successResponse,
        201: successResponse,
        204: { description: "No content - successful operation" },
        400: errorResponse,
        401: errorResponse,
        403: errorResponse,
        404: errorResponse,
      },
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc = generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Paperclip API",
      version: "0.3.0",
      description:
        "文件提供用於外部整合；所有受保護的 API 主要使用 `Authorization: Bearer <token>`。\n若以 session(cookie) 呼叫，所有 unsafe 方法（POST/PUT/PATCH/DELETE）需滿足 CSRF 檢查（Origin/Referer 與請求來源一致）。",
    },
    servers: [{ url: "/" }],
  });

  const anyDoc = doc as any;
  const components = (anyDoc.components ??= {}) as Record<string, unknown>;
  components.securitySchemes = {
    BearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT or API key",
    },
    SessionAuth: {
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token",
    },
  };

  anyDoc.security = [{ BearerAuth: [] }, { SessionAuth: [] }];

  return doc as JsonObject;
}

