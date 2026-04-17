import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { projectService } from "../services/projects.ts";
import { costEvents, issues, projects } from "@paperclipai/db";

describe("projectService.remove", () => {
  it("detaches issue/cost_event references before deleting project", async () => {
    const calls: Array<
      | { kind: "update"; table: unknown; set: Record<string, unknown> }
      | { kind: "delete"; table: unknown }
    > = [];

    const tx = {
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => {
          calls.push({ kind: "update", table, set });
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        },
      }),
      delete: (table: unknown) => {
        calls.push({ kind: "delete", table });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "p1",
                  name: "My Project",
                },
              ]),
          }),
        };
      },
    };

    const db = {
      transaction: async (fn: (tx: any) => Promise<any>) => fn(tx),
    } as unknown as Db;

    const svc = projectService(db);
    const removed = await svc.remove("p1");

    expect(removed).toEqual(
      expect.objectContaining({
        id: "p1",
        name: "My Project",
        urlKey: expect.any(String),
      }),
    );

    expect(calls.map((c) => `${c.kind}:${c.table === issues ? "issues" : c.table === costEvents ? "costEvents" : c.table === projects ? "projects" : "unknown"}`))
      .toEqual(["update:issues", "update:costEvents", "delete:projects"]);

    const issueUpdate = calls.find((c) => c.kind === "update" && c.table === issues) as any;
    expect(issueUpdate.set).toEqual(
      expect.objectContaining({
        projectId: null,
        updatedAt: expect.any(Date),
      }),
    );

    const costEventUpdate = calls.find((c) => c.kind === "update" && c.table === costEvents) as any;
    expect(costEventUpdate.set).toEqual(
      expect.objectContaining({
        projectId: null,
      }),
    );
  });
});

