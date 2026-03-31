import { describe, expect, it } from "vitest";
import { MAX_GROUP_AGENT_COUNT } from "@paperclipai/shared";

// 將 service 的規則固化成純測試：此檔只測「限制與錯誤訊息」的可預期性。
// 實際 DB 行為由 integration test 覆蓋（目前 repo 沒有 chat integration harness，因此先以單元測試保護規則）。
import { mergeEveryoneMentionedAgentIds } from "../lib/chat-everyone-mention.js";

describe("chat group member rules (sanity)", () => {
  it("keeps MAX_GROUP_AGENT_COUNT unchanged", () => {
    expect(MAX_GROUP_AGENT_COUNT).toBe(19);
  });

  it("does not change mention merge behavior", () => {
    const merged = mergeEveryoneMentionedAgentIds("group", "@everyone", [], ["a1", "a2"]);
    expect(new Set(merged)).toEqual(new Set(["a1", "a2"]));
  });
});

