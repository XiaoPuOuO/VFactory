import type { Approval, ApprovalComment, Issue } from "@paperclipai/shared";
import { api, ApiError, getTenantSlug } from "./client";

export const approvalsApi = {
  /** 下載核准紀錄 CSV（依 X-Export-Next-Cursor 串接至完整）。 */
  async downloadApprovalsCsv(
    companyId: string,
    opts?: { scopeAll?: boolean; from?: string; to?: string },
  ): Promise<void> {
    const buildUrl = (cursor?: string): string => {
      const params = new URLSearchParams();
      if (opts?.scopeAll) params.set("scope", "all");
      else {
        if (opts?.from) params.set("from", opts.from);
        if (opts?.to) params.set("to", opts.to);
      }
      params.set("limit", "5000");
      if (cursor) params.set("cursor", cursor);
      return `/companies/${companyId}/approvals/export?${params.toString()}`;
    };

    const fetchExport = async (cursor?: string): Promise<Response> => {
      const headers = new Headers();
      if (getTenantSlug()) headers.set("X-Tenant-Slug", getTenantSlug()!);
      return fetch(`/api${buildUrl(cursor)}`, { credentials: "include", headers });
    };

    const first = await fetchExport();
    if (!first.ok) {
      const errorBody = await first.json().catch(() => null);
      throw new ApiError(
        (errorBody as { error?: string } | null)?.error ?? `Export failed: ${first.status}`,
        first.status,
        errorBody,
      );
    }
    let text = await first.text();
    let cursor = first.headers.get("X-Export-Next-Cursor");
    while (cursor) {
      const next = await fetchExport(cursor);
      if (!next.ok) {
        const errorBody = await next.json().catch(() => null);
        throw new ApiError(
          (errorBody as { error?: string } | null)?.error ?? `Export failed: ${next.status}`,
          next.status,
          errorBody,
        );
      }
      const body = await next.text();
      const lines = body.split("\n");
      if (lines.length > 1) {
        text += lines.slice(1).join("\n");
      }
      cursor = next.headers.get("X-Export-Next-Cursor");
    }

    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `approvals-${companyId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  list: (companyId: string, status?: string) =>
    api.get<Approval[]>(
      `/companies/${companyId}/approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Approval>(`/companies/${companyId}/approvals`, data),
  get: (id: string) => api.get<Approval>(`/approvals/${id}`),
  approve: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/approve`, { decisionNote }),
  reject: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/reject`, { decisionNote }),
  requestRevision: (id: string, decisionNote?: string) =>
    api.post<Approval>(`/approvals/${id}/request-revision`, { decisionNote }),
  resubmit: (id: string, payload?: Record<string, unknown>) =>
    api.post<Approval>(`/approvals/${id}/resubmit`, { payload }),
  listComments: (id: string) => api.get<ApprovalComment[]>(`/approvals/${id}/comments`),
  addComment: (id: string, body: string) =>
    api.post<ApprovalComment>(`/approvals/${id}/comments`, { body }),
  listIssues: (id: string) => api.get<Issue[]>(`/approvals/${id}/issues`),
};
