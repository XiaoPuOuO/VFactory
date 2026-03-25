import { z } from "zod";

/** 租戶 slug：僅允許 [a-z0-9-]+，用於 subdomain 或 path */
export const tenantSlugSchema = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);

export type TenantSlug = z.infer<typeof tenantSlugSchema>;
