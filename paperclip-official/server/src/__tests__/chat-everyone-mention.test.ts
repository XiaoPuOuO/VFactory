import { describe, expect, it } from "vitest";
import { mergeEveryoneMentionedAgentIds } from "../lib/chat-everyone-mention.js";

describe("mergeEveryoneMentionedAgentIds", () => {
  it("leaves mentions unchanged when not group", () => {
    const ids = mergeEveryoneMentionedAgentIds(
      "direct",
      "@everyone hello",
      ["a1"],
      ["a1", "a2"],
    );
    expect(ids).toEqual(["a1"]);
  });

  it("does nothing when group but no @everyone", () => {
    const ids = mergeEveryoneMentionedAgentIds("group", "@COO hi", ["x"], ["a1", "a2"]);
    expect(ids).toEqual(["x"]);
  });

  it("merges all member agent ids when @everyone present (case insensitive)", () => {
    const merged = mergeEveryoneMentionedAgentIds(
      "group",
      "Please review @EVERYONE",
      ["a1"],
      ["a1", "a2", "a3"],
    );
    expect(new Set(merged)).toEqual(new Set(["a1", "a2", "a3"]));
  });

  it("does not match @everyoneish", () => {
    const ids = mergeEveryoneMentionedAgentIds("group", "@everyoneish", [], ["a1"]);
    expect(ids).toEqual([]);
  });
});
