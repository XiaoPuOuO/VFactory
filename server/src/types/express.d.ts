export {};

declare global {
  namespace Express {
    interface Request {
      /** 多租戶：目前請求所屬租戶 id（由 tenantResolutionMiddleware 設定） */
      tenantId?: string;
      /** 多租戶：目前請求所屬租戶 slug */
      tenantSlug?: string;
      actor:
        | {
            type: "board" | "agent" | "none";
            userId?: string;
            agentId?: string;
            companyId?: string;
            companyIds?: string[];
            /** 實例級權限（身分組），* 表示全部權限；含 company.view.all 可看全部公司 */
            permissions?: string[];
            keyId?: string;
            runId?: string;
            source?: "local_implicit" | "session" | "agent_key" | "agent_jwt" | "none";
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
