import type { ProjectStatus } from "../constants.js";
import type { ProjectExecutionWorkspacePolicy, WorkspaceRuntimeService } from "./workspace-runtime.js";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  metadata: Record<string, unknown> | null;
  isPrimary: boolean;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  /** 專案圖示 asset id；若有則顯示上傳圖，否則以 color 顯示色塊。 */
  iconAssetId: string | null;
  /** API 回傳：圖示圖片 URL（/api/assets/:id/content），僅在 iconAssetId 有值時存在。 */
  iconContentPath?: string | null;
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
