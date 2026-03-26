import { describe, expect, it, vi } from "vitest";
import { approvalService } from "../services/approvals.ts";

const mockAgentService = vi.hoisted(() => ({
  activatePendingApproval: vi.fn(),
  create: vi.fn(),
  terminate: vi.fn(),
}));

const mockNotifyHireApproved = vi.hoisted(() => vi.fn());

vi.mock("../services/agents.js", () => ({
  agentService: vi.fn(() => mockAgentService),
}));

vi.mock("../services/hire-hook.js", () => ({
  notifyHireApproved: mockNotifyHireApproved,
}));

type ApprovalRecord = {
  id: string;
  companyId: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  requestedByAgentId: string | null;
  requestedByUserId?: string | null;
  decidedByUserId?: string | null;
  decisionSource?: string;
  policyId?: string | null;
  policySnapshot?: Record<string, unknown> | null;
  decidedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  decisionNote?: string | null;
};

function createLockedDb(initial: ApprovalRecord) {
  let approval = { ...initial };

  // A simple mutex to serialize transaction callbacks.
  let lock = Promise.resolve();
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = lock;
    let release!: () => void;
    lock = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  const execute = vi.fn(async () => undefined);

  const selectWhere = vi.fn(async () => [approval]);
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));

  let pendingPatch: Record<string, unknown> | null = null;
  const returning = vi.fn(async () => {
    if (!pendingPatch) return [];
    // Apply update only if still resolvable at the moment the DB would update.
    if (approval.status !== "pending" && approval.status !== "revision_requested") {
      pendingPatch = null;
      return [];
    }
    approval = { ...approval, ...pendingPatch } as ApprovalRecord;
    pendingPatch = null;
    return [approval];
  });
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn((patch: Record<string, unknown>) => {
    pendingPatch = patch;
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set }));

  const transaction = vi.fn(async (fn: (tx: any) => any) =>
    withLock(async () => {
      const tx = { execute, select, update };
      return await fn(tx);
    }),
  );

  return { db: { transaction }, execute };
}

describe("approvalService concurrency", () => {
  it("serializes concurrent approves; side effects occur once", async () => {
    mockAgentService.activatePendingApproval.mockResolvedValue(undefined);
    mockNotifyHireApproved.mockResolvedValue(undefined);

    const { db, execute } = createLockedDb({
      id: "approval-1",
      companyId: "company-1",
      type: "hire_agent",
      status: "pending",
      payload: { agentId: "agent-1" },
      requestedByAgentId: "requester-1",
    });

    const svc = approvalService(db as any);

    const [r1, r2] = await Promise.all([
      svc.approve("approval-1", "board", "ship it"),
      svc.approve("approval-1", "board", "ship it"),
    ]);

    expect(execute).toHaveBeenCalled(); // SELECT ... FOR UPDATE was issued
    expect([r1.applied, r2.applied].filter(Boolean)).toHaveLength(1);
    expect(mockAgentService.activatePendingApproval).toHaveBeenCalledTimes(1);
    expect(mockNotifyHireApproved).toHaveBeenCalledTimes(1);
  });
});

