import type { Router } from "express";
import swaggerUi from "swagger-ui-express";
import type { JsonObject } from "swagger-ui-express";

export function registerOpenApiEndpoints(apiRouter: Router, openApiDoc: JsonObject) {
  apiRouter.get("/openapi.json", (_req, res) => {
    res.json(openApiDoc);
  });

  apiRouter.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDoc, {
      swaggerOptions: { persistAuthorization: true },
    }),
  );
}

