import { describe, expect, it } from "vitest";
import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";
import {
  buildMergedAgentInstructionsContent,
  readContextProjectId,
  resolveHeartbeatInstructionPaths,
  resolveRuntimeSessionParamsForWorkspace,
  shouldResetTaskSessionForWake,
  type ResolvedWorkspaceForRun,
} from "../services/heartbeat.ts";

function buildResolvedWorkspace(overrides: Partial<ResolvedWorkspaceForRun> = {}): ResolvedWorkspaceForRun {
  return {
    cwd: "/tmp/project",
    source: "project_primary",
    projectId: "project-1",
    workspaceId: "workspace-1",
    repoUrl: null,
    repoRef: null,
    workspaceHints: [],
    warnings: [],
    ...overrides,
  };
}

describe("readContextProjectId", () => {
  it("prefers projectId when both are set", () => {
    expect(
      readContextProjectId({
        projectId: "p-issue",
        chatProjectId: "p-chat",
      }),
    ).toBe("p-issue");
  });

  it("falls back to chatProjectId when composer-selected project (chat) has no projectId", () => {
    expect(readContextProjectId({ chatProjectId: "p-composer" })).toBe("p-composer");
  });

  it("returns null when neither is set", () => {
    expect(readContextProjectId({})).toBeNull();
  });
});

describe("resolveRuntimeSessionParamsForWorkspace", () => {
  it("migrates fallback workspace sessions to project workspace when project cwd becomes available", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toMatchObject({
      sessionId: "session-1",
      cwd: "/tmp/new-project-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toContain("Attempting to resume session");
  });

  it("does not migrate when previous session cwd is not the fallback workspace", () => {
    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId: "agent-123",
      previousSessionParams: {
        sessionId: "session-1",
        cwd: "/tmp/some-other-cwd",
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({ cwd: "/tmp/new-project-cwd" }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: "/tmp/some-other-cwd",
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });

  it("does not migrate when resolved workspace id differs from previous session workspace id", () => {
    const agentId = "agent-123";
    const fallbackCwd = resolveDefaultAgentWorkspaceDir(agentId);

    const result = resolveRuntimeSessionParamsForWorkspace({
      agentId,
      previousSessionParams: {
        sessionId: "session-1",
        cwd: fallbackCwd,
        workspaceId: "workspace-1",
      },
      resolvedWorkspace: buildResolvedWorkspace({
        cwd: "/tmp/new-project-cwd",
        workspaceId: "workspace-2",
      }),
    });

    expect(result.sessionParams).toEqual({
      sessionId: "session-1",
      cwd: fallbackCwd,
      workspaceId: "workspace-1",
    });
    expect(result.warning).toBeNull();
  });
});

describe("shouldResetTaskSessionForWake", () => {
  it("resets session context on assignment wake", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_assigned" })).toBe(true);
  });

  it("resets session context on timer heartbeats", () => {
    expect(shouldResetTaskSessionForWake({ wakeSource: "timer" })).toBe(true);
  });

  it("resets session context on manual on-demand invokes", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "manual",
      }),
    ).toBe(true);
  });

  it("does not reset session context on mention wake comment", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_comment_mentioned",
        wakeCommentId: "comment-1",
      }),
    ).toBe(false);
  });

  it("does not reset session context when commentId is present", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeReason: "issue_commented",
        commentId: "comment-2",
      }),
    ).toBe(false);
  });

  it("does not reset for comment wakes", () => {
    expect(shouldResetTaskSessionForWake({ wakeReason: "issue_commented" })).toBe(false);
  });

  it("does not reset when wake reason is missing", () => {
    expect(shouldResetTaskSessionForWake({})).toBe(false);
  });

  it("does not reset session context on callback on-demand invokes", () => {
    expect(
      shouldResetTaskSessionForWake({
        wakeSource: "on_demand",
        wakeTriggerDetail: "callback",
      }),
    ).toBe(false);
  });
});

describe("buildMergedAgentInstructionsContent", () => {
  it("keeps bundled instructions first and appends workspace add-on instructions", () => {
    const merged = buildMergedAgentInstructionsContent([
      {
        filePath: "/repo/paperclip-official/AgentSetting/AGENTS.md",
        content: "Bundled instructions",
      },
      {
        filePath: "/workspace/AgentSetting/AGENTS.md",
        content: "Workspace instructions",
      },
    ]);

    expect(merged).toContain("Source: /repo/paperclip-official/AgentSetting/AGENTS.md");
    expect(merged).toContain("Source: /workspace/AgentSetting/AGENTS.md");
    expect(merged.indexOf("Bundled instructions")).toBeLessThan(
      merged.indexOf("Workspace instructions"),
    );
  });
});

describe("resolveHeartbeatInstructionPaths", () => {
  it("prepends dedicated instructions before bundled and workspace governance", () => {
    expect(
      resolveHeartbeatInstructionPaths({
        dedicatedInstructionPaths: ["/company/agents/ceo/AGENTS.md"],
        bundledPath: "/repo/paperclip-official/AgentSetting/AGENTS.md",
        workspacePath: "/workspace/AgentSetting/AGENTS.md",
      }),
    ).toEqual([
      "/company/agents/ceo/AGENTS.md",
      "/repo/paperclip-official/AgentSetting/AGENTS.md",
      "/workspace/AgentSetting/AGENTS.md",
    ]);
  });

  it("deduplicates repeated instruction paths while preserving order", () => {
    expect(
      resolveHeartbeatInstructionPaths({
        dedicatedInstructionPaths: [
          "/repo/paperclip-official/AgentSetting/AGENTS.md",
          "/repo/paperclip-official/AgentSetting/AGENTS.md",
        ],
        bundledPath: "/repo/paperclip-official/AgentSetting/AGENTS.md",
        workspacePath: "/workspace/AgentSetting/AGENTS.md",
      }),
    ).toEqual([
      "/repo/paperclip-official/AgentSetting/AGENTS.md",
      "/workspace/AgentSetting/AGENTS.md",
    ]);
  });
});
