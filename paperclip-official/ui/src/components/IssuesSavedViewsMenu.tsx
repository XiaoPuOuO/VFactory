import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueSavedViewPayload } from "@paperclipai/shared";
import { issueSavedViewsApi } from "../api/issue-saved-views";
import { queryKeys } from "../lib/queryKeys";
import { useToast } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bookmark, Loader2, Trash2 } from "lucide-react";
import type { IssueViewState } from "./IssuesList";

function buildPayload(viewState: IssueViewState, issueSearch: string): IssueSavedViewPayload {
  return {
    statuses: viewState.statuses,
    priorities: viewState.priorities,
    assignees: viewState.assignees,
    labels: viewState.labels,
    sortField: viewState.sortField,
    sortDir: viewState.sortDir,
    groupBy: viewState.groupBy,
    viewMode: viewState.viewMode,
    collapsedGroups: viewState.collapsedGroups,
    issueSearch: issueSearch.trim() || undefined,
  };
}

interface IssuesSavedViewsMenuProps {
  companyId: string;
  scopeKey: string;
  viewState: IssueViewState;
  issueSearch: string;
  updateView: (patch: Partial<IssueViewState>) => void;
  setIssueSearch: (v: string) => void;
  setDebouncedIssueSearch: (v: string) => void;
}

export function IssuesSavedViewsMenu({
  companyId,
  scopeKey,
  viewState,
  issueSearch,
  updateView,
  setIssueSearch,
  setDebouncedIssueSearch,
}: IssuesSavedViewsMenuProps) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const { data: views = [], isLoading } = useQuery({
    queryKey: queryKeys.issues.savedViews(companyId, scopeKey),
    queryFn: () => issueSavedViewsApi.list(companyId, scopeKey),
    enabled: !!companyId && !!scopeKey,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.savedViews(companyId, scopeKey) });
  };

  const createMut = useMutation({
    mutationFn: (name: string) =>
      issueSavedViewsApi.create(companyId, {
        name: name.trim(),
        scopeKey,
        payload: buildPayload(viewState, issueSearch),
      }),
    onSuccess: () => {
      invalidate();
      setSaveOpen(false);
      setSaveName("");
      pushToast({ title: t("issuesList.savedViewCreated"), tone: "success" });
    },
    onError: (e: Error) => {
      pushToast({ title: e.message || t("issuesList.savedViewError"), tone: "error" });
    },
  });

  const removeMut = useMutation({
    mutationFn: (viewId: string) => issueSavedViewsApi.remove(companyId, viewId),
    onSuccess: () => {
      invalidate();
      pushToast({ title: t("issuesList.savedViewDeleted"), tone: "success" });
    },
    onError: (e: Error) => {
      pushToast({ title: e.message || t("issuesList.savedViewError"), tone: "error" });
    },
  });

  function applyView(v: { payload: IssueSavedViewPayload }) {
    const p = v.payload;
    updateView({
      statuses: p.statuses,
      priorities: p.priorities,
      assignees: p.assignees,
      labels: p.labels,
      sortField: p.sortField,
      sortDir: p.sortDir,
      groupBy: p.groupBy,
      viewMode: p.viewMode,
      collapsedGroups: p.collapsedGroups,
    });
    const q = p.issueSearch ?? "";
    setIssueSearch(q);
    setDebouncedIssueSearch(q);
    setOpen(false);
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="issues-toolbar-btn-text" aria-haspopup="dialog">
            <Bookmark className="issues-toolbar-btn-icon-sm" />
            <span className="issues-toolbar-btn-label">{t("issuesList.savedViews")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="issues-saved-views-popover">
          <div className="issues-saved-views-inner">
            <div className="issues-saved-views-header">
              <span className="issues-saved-views-title">{t("issuesList.savedViewsTitle")}</span>
            </div>
            {isLoading ? (
              <div className="issues-saved-views-loading">
                <Loader2 className="issues-saved-views-spinner" />
              </div>
            ) : views.length === 0 ? (
              <p className="issues-saved-views-empty">{t("issuesList.savedViewsEmpty")}</p>
            ) : (
              <ul className="issues-saved-views-list">
                {views.map((v) => (
                  <li key={v.id} className="issues-saved-views-row">
                    <button type="button" className="issues-saved-views-apply" onClick={() => applyView(v)}>
                      {v.name}
                    </button>
                    <button
                      type="button"
                      className="issues-saved-views-delete"
                      aria-label={t("issuesList.savedViewDeleteAria", { name: v.name })}
                      disabled={removeMut.isPending}
                      onClick={() => {
                        if (window.confirm(t("issuesList.savedViewDeleteConfirm", { name: v.name }))) {
                          removeMut.mutate(v.id);
                        }
                      }}
                    >
                      <Trash2 className="issues-saved-views-delete-icon" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="issues-saved-views-save-btn"
              onClick={() => {
                setSaveOpen(true);
                setOpen(false);
              }}
            >
              {t("issuesList.saveCurrentView")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="issues-saved-view-dialog">
          <DialogHeader>
            <DialogTitle>{t("issuesList.saveCurrentView")}</DialogTitle>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t("issuesList.savedViewNamePlaceholder")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && saveName.trim()) {
                createMut.mutate(saveName);
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)}>
              {t("issuesList.savedViewCancel")}
            </Button>
            <Button
              type="button"
              disabled={!saveName.trim() || createMut.isPending}
              onClick={() => createMut.mutate(saveName)}
            >
              {createMut.isPending ? t("issuesList.savedViewSaving") : t("issuesList.savedViewSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
