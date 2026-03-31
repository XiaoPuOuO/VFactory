import { describe, expect, it } from "vitest";
import {
  getCachedAgentHireResponse,
  hireDedupeKey,
  setCachedAgentHireResponse,
} from "../lib/agent-hire-dedupe.ts";

describe("agent-hire-dedupe", () => {
  it("returns cached payload for identical company, run, and hire fingerprint", () => {
    const key = hireDedupeKey("c1", "run-1", {
      name: "A",
      role: "general",
      title: null,
      reportsTo: null,
      adapterType: "claude_local",
    });
    const payload = { agent: { id: "ag1" }, approval: null };
    setCachedAgentHireResponse(key, payload);
    expect(getCachedAgentHireResponse(key)).toEqual(payload);
  });

  it("uses different keys for different hire names in same run", () => {
    const k1 = hireDedupeKey("c1", "run-1", {
      name: "A",
      role: "general",
      title: null,
      reportsTo: null,
      adapterType: "process",
    });
    const k2 = hireDedupeKey("c1", "run-1", {
      name: "B",
      role: "general",
      title: null,
      reportsTo: null,
      adapterType: "process",
    });
    setCachedAgentHireResponse(k1, { x: 1 });
    expect(getCachedAgentHireResponse(k2)).toBeNull();
  });
});
