export {};

import "express-serve-static-core";

declare global {
  namespace Express {
    interface Request {
      /** 多租戶：目前請求所屬租戶 id（由 tenantResolutionMiddleware 設定） */
      tenantId?: string;
      /** SCIM Bearer 驗證成功時之佈建金鑰 id */
      scimProvisioningKeyId?: string;
      /** 多租戶：目前請求所屬租戶 slug */
      tenantSlug?: string;
      actor:
        | {
            type: "board" | "agent" | "service" | "none";
            userId?: string;
            agentId?: string;
            companyId?: string;
            companyIds?: string[];
            /** 實例級權限（身分組），* 表示全部權限；含 company.view.all 可看全部公司 */
            permissions?: string[];
            keyId?: string;
            runId?: string;
            /** 整合 API token（非 agent）授予之範圍（見 INTEGRATION_TOKEN_SCOPES） */
            integrationScopes?: string[];
            source?:
              | "local_implicit"
              | "session"
              | "agent_key"
              | "agent_jwt"
              | "integration_key"
              | "none";
          }
        | {
            type: "banned";
            userId: string;
            reason: string;
            bannedUntil: Date | null;
          };
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    /** 多租戶：目前請求所屬租戶 id（由 tenantResolutionMiddleware 設定） */
    tenantId?: string;
    /** SCIM Bearer 驗證成功時之佈建金鑰 id */
    scimProvisioningKeyId?: string;
    /** 多租戶：目前請求所屬租戶 slug */
    tenantSlug?: string;
    actor:
      | {
          type: "board" | "agent" | "service" | "none";
          userId?: string;
          agentId?: string;
          companyId?: string;
          companyIds?: string[];
          /** 實例級權限（身分組），* 表示全部權限；含 company.view.all 可看全部公司 */
          permissions?: string[];
          keyId?: string;
          runId?: string;
          /** 整合 API token（非 agent）授予之範圍（見 INTEGRATION_TOKEN_SCOPES） */
          integrationScopes?: string[];
          source?:
            | "local_implicit"
            | "session"
            | "agent_key"
            | "agent_jwt"
            | "integration_key"
            | "none";
        }
      | {
          type: "banned";
          userId: string;
          reason: string;
          bannedUntil: Date | null;
        };
  }
}
