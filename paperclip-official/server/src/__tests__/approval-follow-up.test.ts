import { beforeEach, describe, expect, it, vi } from "vitest";
import { runApprovalApprovedFollowUp } from "../services/approval-follow-up.ts";

const mockWakeup = vi.fn();
const mockListIssuesForApproval = vi.fn();

vi.mock("../services/heartbeat.js", () => ({
  heartbeatService: () => ({
    wakeup: mockWakeup,
  }),
}));

vi.mock("../services/issue-approvals.js", () => ({
  issueApprovalService: () => ({
    listIssuesForApproval: mockListIssuesForApproval,
  }),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

describe("runApprovalApprovedFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListIssuesForApproval.mockResolvedValue([]);
    mockWakeup.mockResolvedValue({ id: "wake-1" });
  });

  const baseApproval = {
    id: "approval-1",
    companyId: "company-1",
    status: "approved",
    requestedByAgentId: "requester-1",
    requestedByUserId: null,
    decidedByUserId: null,
    decisionNote: null,
    decisionSource: "policy",
    policyId: null,
    decidedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    payloadJson: "{}",
    payload: {},
  } as const;

  it("does not wake the requester when approval type is hire_agent", async () => {
    await runApprovalApprovedFollowUp(
      {} as never,
      {
        ...baseApproval,
        type: "hire_agent",
      } as never,
      { userId: null, label: "policy" },
    );

    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("still wakes the requester for non-hire approval types", async () => {
    await runApprovalApprovedFollowUp(
      {} as never,
      {
        ...baseApproval,
        type: "approve_ceo_strategy",
      } as never,
      { userId: null, label: "policy" },
    );

    expect(mockWakeup).toHaveBeenCalledTimes(1);
  });
});
