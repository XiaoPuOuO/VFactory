import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  const middleware = (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };

  // 給 OpenAPI 產生器用的中繼資料：標記這個 middleware 會解析/驗證對應的 Zod schema。
  // 掃描 Express router stack 時會透過此屬性取回 request body schema。
  (middleware as unknown as { __paperclip_zod_schema?: ZodSchema }).__paperclip_zod_schema = schema;

  return middleware;
}
