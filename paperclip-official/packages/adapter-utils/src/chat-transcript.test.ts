import { describe, expect, it } from "vitest";
import {
  formatChatTranscriptForPrompt,
  truncateChatMessageBody,
} from "./chat-transcript.js";

describe("truncateChatMessageBody", () => {
  it("returns empty when maxLen is zero", () => {
    expect(truncateChatMessageBody("hello", 0)).toBe("");
  });

  it("truncates long body with ellipsis", () => {
    const s = "a".repeat(100);
    expect(truncateChatMessageBody(s, 10)).toBe("aaaaaaaaaa…");
  });

  it("leaves short body unchanged", () => {
    expect(truncateChatMessageBody("hi", 100)).toBe("hi");
  });
});

describe("formatChatTranscriptForPrompt", () => {
  it("returns null for empty messages", () => {
    expect(
      formatChatTranscriptForPrompt([], {
        agentId: "a1",
        maxMessageChars: 1000,
        maxTotalChars: 10000,
      }),
    ).toBeNull();
  });

  it("sorts by time and labels Board vs agent", () => {
    const out = formatChatTranscriptForPrompt(
      [
        {
          id: "2",
          body: "msg-later",
          createdAt: "2025-01-01T12:05:00.000Z",
          authorAgentId: null,
          authorUserId: "u1",
        },
        {
          id: "1",
          body: "msg-earlier",
          createdAt: "2025-01-01T12:00:00.000Z",
          authorAgentId: "ag1",
          authorUserId: null,
          authorAgentName: "Bot",
        },
      ],
      {
        agentId: "other",
        maxMessageChars: 1000,
        maxTotalChars: 10000,
      },
    );
    expect(out).toContain("Bot: msg-earlier");
    expect(out).toContain("Board: msg-later");
    const lines = out!.split("\n").filter(Boolean);
    expect(lines[0]).toContain("msg-earlier");
    expect(lines[1]).toContain("msg-later");
  });

  it("drops oldest lines when over maxTotalChars", () => {
    const long = "x".repeat(500);
    const messages = [1, 2, 3, 4, 5].map((n) => ({
      id: `m${n}`,
      body: long,
      createdAt: `2025-01-01T12:0${n}:00.000Z`,
      authorAgentId: null as string | null,
      authorUserId: "u1",
    }));
    const out = formatChatTranscriptForPrompt(messages, {
      agentId: undefined,
      maxMessageChars: 2000,
      maxTotalChars: 800,
    });
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(801);
  });
});
