import { describe, it, expect } from "vitest";

/**
 * 與 server issueService.findMentionedUsers 規則一致：同名的 agent 優先於 user。
 */
function resolveMentionTargets(
  tokens: Set<string>,
  agentNamesLower: Set<string>,
  users: { id: string; name: string }[],
): string[] {
  const matched: string[] = [];
  const seen = new Set<string>();
  for (const u of users) {
    const lower = u.name.toLowerCase();
    if (!tokens.has(lower)) continue;
    if (agentNamesLower.has(lower)) continue;
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    matched.push(u.id);
  }
  return matched;
}

describe("findMentionedUsers logic", () => {
  it("prefers agent when name collides", () => {
    const tokens = new Set(["alice"]);
    const agentNames = new Set(["alice"]);
    const users = [{ id: "u1", name: "Alice" }];
    expect(resolveMentionTargets(tokens, agentNames, users)).toEqual([]);
  });

  it("returns user when no agent match", () => {
    const tokens = new Set(["bob"]);
    const agentNames = new Set<string>();
    const users = [{ id: "u2", name: "Bob" }];
    expect(resolveMentionTargets(tokens, agentNames, users)).toEqual(["u2"]);
  });
});
