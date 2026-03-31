import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@paperclipai/shared";
import { issueIdentifiersAfterLastUserMessage } from "./chatPipelineIssueRefs";

describe("issueIdentifiersAfterLastUserMessage", () => {
  it("collects issue refs only from agent messages after the latest user message", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        roomId: "r",
        companyId: "c",
        authorAgentId: "a1",
        authorUserId: null,
        body: "Done see HOP-99",
        createdAt: "2026-01-01T12:03:00Z",
        updatedAt: "2026-01-01T12:03:00Z",
      },
      {
        id: "2",
        roomId: "r",
        companyId: "c",
        authorAgentId: null,
        authorUserId: "u1",
        body: "hire please",
        createdAt: "2026-01-01T12:02:00Z",
        updatedAt: "2026-01-01T12:02:00Z",
      },
      {
        id: "3",
        roomId: "r",
        companyId: "c",
        authorAgentId: "a1",
        authorUserId: null,
        body: "Old HOP-1",
        createdAt: "2026-01-01T12:01:00Z",
        updatedAt: "2026-01-01T12:01:00Z",
      },
    ];
    const ids = issueIdentifiersAfterLastUserMessage(messages, "HOP");
    expect(ids).toContain("HOP-99");
    expect(ids).not.toContain("HOP-1");
  });
});
