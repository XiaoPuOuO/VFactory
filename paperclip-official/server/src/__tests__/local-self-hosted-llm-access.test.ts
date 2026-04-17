import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import {
  ADAPTER_TYPE_TO_MODEL_PERMISSION,
  AGENT_ADAPTER_TYPES,
  MODEL_PERMISSION_KEYS,
} from "@paperclipai/shared";
import { authUsers, companyMemberships, principalPermissionGrants } from "@paperclipai/db";
import { accessService } from "../services/access.js";
import { errorHandler } from "../middleware/index.js";

vi.mock("../routes/company-permission.js", () => ({
  assertCompanyPermission: vi.fn().mockResolvedValue(undefined),
}));

const mockAgentCreate = vi.fn();

vi.mock("../services/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/index.js")>();
  return {
    ...actual,
    accessService: () => ({
      getAllowedAdapterTypes: vi.fn().mockResolvedValue(
        Object.keys(ADAPTER_TYPE_TO_MODEL_PERMISSION).filter((t) => t !== "local_self_hosted_llm"),
      ),
      canUser: vi.fn(),
      hasPermission: vi.fn(),
      hasInstanceFullAccess: vi.fn().mockResolvedValue(false),
      getInstancePermissionsForUser: vi.fn().mockResolvedValue([]),
      setUserGroup: vi.fn(),
      listBoardUsers: vi.fn(),
      getBanStatus: vi.fn(),
      banUser: vi.fn(),
      unbanUser: vi.fn(),
      updateUserName: vi.fn(),
      deleteUser: vi.fn(),
      listPrincipalGrants: vi.fn(),
      getMembership: vi.fn(),
      ensureMembership: vi.fn(),
      listMembers: vi.fn(),
      setMemberPermissions: vi.fn(),
      listUserCompanyAccess: vi.fn(),
      setUserCompanyAccess: vi.fn(),
      setPrincipalGrants: vi.fn(),
    }),
    agentService: () => ({
      create: mockAgentCreate,
      getById: vi.fn(),
      list: vi.fn(),
      orgForCompany: vi.fn(),
      update: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      terminate: vi.fn(),
      remove: vi.fn(),
      listKeys: vi.fn(),
      createApiKey: vi.fn(),
      revokeKey: vi.fn(),
      resolveByReference: vi.fn(),
      getChainOfCommand: vi.fn(),
      updatePermissions: vi.fn(),
      listConfigRevisions: vi.fn(),
      getConfigRevision: vi.fn(),
      rollbackConfigRevision: vi.fn(),
      deduplicateAgentName: vi.fn(),
    }),
    secretService: () => ({
      normalizeAdapterConfigForPersistence: vi.fn(async (_c: string, cfg: Record<string, unknown>) => cfg),
      resolveAdapterConfigForRuntime: vi.fn(async (_c: string, cfg: Record<string, unknown>) => ({ config: cfg })),
    }),
    logActivity: vi.fn().mockResolvedValue(undefined),
    companyService: () => ({
      getById: vi.fn().mockResolvedValue(null),
    }),
  };
});

vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => ({
    getDefaultCompanyPath: vi.fn().mockResolvedValue(null),
  }),
}));

function createOwnerMembershipDb(): Db {
  const ownerMembershipRow = [
    {
      id: "mem-1",
      companyId: "company-1",
      principalType: "user",
      principalId: "user-1",
      status: "active",
      membershipRole: "owner",
    },
  ];
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === authUsers) return [{ group: null as string | null }];
          if (table === companyMemberships) return ownerMembershipRow;
          if (table === principalPermissionGrants) return [];
          return [];
        },
      }),
    }),
  } as unknown as Db;
}

describe("local_self_hosted_llm shared constants", () => {
  it("registers the adapter type and permission mapping", () => {
    expect(AGENT_ADAPTER_TYPES).toContain("local_self_hosted_llm");
    expect(MODEL_PERMISSION_KEYS).toContain("model.local_self_hosted_llm");
    expect(ADAPTER_TYPE_TO_MODEL_PERMISSION.local_self_hosted_llm).toBe(
      "model.local_self_hosted_llm",
    );
  });
});

describe("local_self_hosted_llm access (getAllowedAdapterTypes)", () => {
  it("includes local_self_hosted_llm when the principal has model permission via company owner membership", async () => {
    const access = accessService(createOwnerMembershipDb());
    const allowed = await access.getAllowedAdapterTypes("company-1", "user-1", false);
    expect(allowed).toContain("local_self_hosted_llm");
  });
});

describe("local_self_hosted_llm agent create authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentCreate.mockReset();
  });

  it("returns 403 when local_self_hosted_llm is not in allowed adapter types for the company", async () => {
    const { agentRoutes } = await import("../routes/agents.js");
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as express.Request & { actor: unknown }).actor = {
        type: "board",
        source: "session",
        userId: "user-1",
        companyIds: ["company-1"],
        permissions: [],
      };
      next();
    });
    app.use("/api", agentRoutes({} as Db, {} as import("../storage/types.js").StorageService));
    app.use(errorHandler);

    const res = await request(app)
      .post("/api/companies/company-1/agents")
      .send({
        name: "Self Hosted",
        adapterType: "local_self_hosted_llm",
        adapterConfig: {
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "llama3.1",
        },
      });

    expect(res.status).toBe(403);
    expect(String(res.body?.error ?? "")).toContain("You do not have permission to use this adapter type");
    expect(mockAgentCreate).not.toHaveBeenCalled();
  });
});
