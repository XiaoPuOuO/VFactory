import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAgentsFallbackPathWithMtimeCache } from "../services/agents-instruction-path-cache.js";

describe("resolveAgentsFallbackPathWithMtimeCache", () => {
  it("returns cached path without re-invoking find when mtime unchanged", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-agents-cache-"));
    const agentsPath = path.join(tmp, "AGENTS.md");
    await fs.writeFile(agentsPath, "x", "utf8");

    let calls = 0;
    const find = async () => {
      calls += 1;
      return agentsPath;
    };

    const a = await resolveAgentsFallbackPathWithMtimeCache(tmp, find);
    const b = await resolveAgentsFallbackPathWithMtimeCache(tmp, find);
    expect(a).toBe(agentsPath);
    expect(b).toBe(agentsPath);
    expect(calls).toBe(1);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});
