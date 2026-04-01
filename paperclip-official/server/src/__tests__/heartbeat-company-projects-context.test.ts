import { afterEach, describe, expect, it, vi } from "vitest";
import { mapCompanyProjectsForHeartbeatContext } from "../services/heartbeat.js";

describe("mapCompanyProjectsForHeartbeatContext", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves descriptions in full mode", () => {
    vi.stubEnv("HEARTBEAT_COMPANY_PROJECTS_LIST_MODE", "full");
    const rows = [{ id: "1", name: "A", description: "long desc" }];
    expect(mapCompanyProjectsForHeartbeatContext(rows)).toEqual([
      { id: "1", name: "A", description: "long desc" },
    ]);
  });

  it("strips descriptions in summary mode", () => {
    vi.stubEnv("HEARTBEAT_COMPANY_PROJECTS_LIST_MODE", "summary");
    const rows = [{ id: "1", name: "A", description: "long desc" }];
    expect(mapCompanyProjectsForHeartbeatContext(rows)).toEqual([
      { id: "1", name: "A", description: null },
    ]);
  });
});
