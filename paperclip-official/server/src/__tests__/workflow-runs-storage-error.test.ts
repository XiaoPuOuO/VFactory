import { describe, expect, it } from "vitest";
import { isWorkflowRunsStorageSchemaError } from "../lib/workflow-runs-storage-error.js";

describe("isWorkflowRunsStorageSchemaError", () => {
  it("detects missing relation from message", () => {
    expect(
      isWorkflowRunsStorageSchemaError(new Error('relation "workflow_runs" does not exist')),
    ).toBe(true);
  });

  it("detects missing column on workflow_runs", () => {
    expect(
      isWorkflowRunsStorageSchemaError(
        new Error('column "parent_run_id" of relation "workflow_runs" does not exist'),
      ),
    ).toBe(true);
  });

  it("detects PostgreSQL 42P01 when message mentions workflow_runs", () => {
    const err = Object.assign(new Error('relation "workflow_runs" does not exist'), { code: "42P01" });
    expect(isWorkflowRunsStorageSchemaError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isWorkflowRunsStorageSchemaError(new Error("connection refused"))).toBe(false);
  });
});
