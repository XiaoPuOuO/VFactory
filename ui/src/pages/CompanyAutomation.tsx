import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import type { AutomationRuleAction, AutomationRuleTrigger, CreateAutomationRule } from "@paperclipai/shared";
import { AGENT_STATUSES } from "@paperclipai/shared";
import { companiesApi, type AutomationRuleRow } from "../api/companies";
import { costsApi } from "../api/costs";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { ApiError } from "../api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "./CompanyAutomation.css";

const ISSUE_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const;

export function CompanyAutomation() {
  const { t } = useTranslation(["company", "common"]);
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRuleRow | null>(null);

  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [triggerKind, setTriggerKind] = useState<AutomationRuleTrigger["type"]>("issue_status");
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("todo");
  const [budgetPolicyId, setBudgetPolicyId] = useState("");
  const [agentFrom, setAgentFrom] = useState("");
  const [agentTo, setAgentTo] = useState("paused");

  const [actionKind, setActionKind] = useState<AutomationRuleAction["type"]>("add_issue_labels");
  const [pauseTarget, setPauseTarget] = useState<"issue_assignee" | "event_agent" | "specific_agent">(
    "issue_assignee",
  );
  const [pauseAgentId, setPauseAgentId] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [followTitle, setFollowTitle] = useState("Follow-up: {{issue.identifier}}");
  const [followProjectId, setFollowProjectId] = useState<string>("");
  const [linkParent, setLinkParent] = useState(true);

  const { data: rulesData, isLoading } = useQuery({
    queryKey: ["automation-rules", selectedCompanyId],
    queryFn: () => companiesApi.listAutomationRules(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: labels = [] } = useQuery({
    queryKey: queryKeys.issues.labels(selectedCompanyId!),
    queryFn: () => issuesApi.listLabels(selectedCompanyId!),
    enabled: !!selectedCompanyId && dialogOpen,
  });

  const { data: budgetPolicies = [] } = useQuery({
    queryKey: queryKeys.budgetPolicies(selectedCompanyId!),
    queryFn: () => costsApi.listBudgetPolicies(selectedCompanyId!),
    enabled: !!selectedCompanyId && dialogOpen && triggerKind === "budget_policy_breach_first",
  });

  const { data: projects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && dialogOpen && actionKind === "create_followup_issue",
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("common:companies"), href: "/issues" },
      { label: t("nav:settings"), href: "/company/settings" },
      { label: t("company:automationTitle") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  function resetForm() {
    setName("");
    setEnabled(true);
    setTriggerKind("issue_status");
    setIssueFrom("");
    setIssueTo("todo");
    setBudgetPolicyId("");
    setAgentFrom("");
    setAgentTo("paused");
    setActionKind("add_issue_labels");
    setPauseTarget("issue_assignee");
    setPauseAgentId("");
    setLabelIds([]);
    setFollowTitle("Follow-up: {{issue.identifier}}");
    setFollowProjectId("");
    setLinkParent(true);
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(row: AutomationRuleRow) {
    setEditing(row);
    setName(row.name);
    setEnabled(row.enabled);
    const tr = row.trigger as AutomationRuleTrigger;
    setTriggerKind(tr.type);
    if (tr.type === "issue_status") {
      setIssueFrom(tr.fromStatus ?? "");
      setIssueTo(tr.toStatus);
    } else if (tr.type === "budget_policy_breach_first") {
      setBudgetPolicyId(tr.policyId ?? "");
    } else if (tr.type === "agent_status") {
      setAgentFrom(tr.fromStatus ?? "");
      setAgentTo(tr.toStatus);
    }
    const acts = row.actions as AutomationRuleAction[];
    const a = acts[0];
    if (a) {
      setActionKind(a.type);
      if (a.type === "pause_agent") {
        setPauseTarget(a.target);
        setPauseAgentId(a.agentId ?? "");
      } else if (a.type === "add_issue_labels") {
        setLabelIds([...a.labelIds]);
      } else if (a.type === "create_followup_issue") {
        setFollowTitle(a.title);
        setFollowProjectId(a.projectId ?? "");
        setLinkParent(a.linkParentIssue !== false);
      }
    }
    setDialogOpen(true);
  }

  function buildPayload(): CreateAutomationRule {
    let trigger: AutomationRuleTrigger;
    if (triggerKind === "issue_status") {
      trigger = {
        type: "issue_status",
        toStatus: issueTo,
        ...(issueFrom.trim() ? { fromStatus: issueFrom.trim() } : {}),
      };
    } else if (triggerKind === "budget_policy_breach_first") {
      trigger = {
        type: "budget_policy_breach_first",
        ...(budgetPolicyId.trim() ? { policyId: budgetPolicyId.trim() } : {}),
      };
    } else {
      trigger = {
        type: "agent_status",
        toStatus: agentTo,
        ...(agentFrom.trim() ? { fromStatus: agentFrom.trim() } : {}),
      };
    }

    let action: AutomationRuleAction;
    if (actionKind === "pause_agent") {
      action = {
        type: "pause_agent",
        target: pauseTarget,
        ...(pauseTarget === "specific_agent" && pauseAgentId.trim()
          ? { agentId: pauseAgentId.trim() }
          : {}),
      };
    } else if (actionKind === "add_issue_labels") {
      if (labelIds.length === 0) throw new Error(t("company:automationLabelsRequired"));
      action = { type: "add_issue_labels", labelIds };
    } else {
      action = {
        type: "create_followup_issue",
        title: followTitle.trim(),
        ...(followProjectId ? { projectId: followProjectId } : { projectId: null }),
        linkParentIssue: linkParent,
        status: "backlog",
      };
    }

    return {
      name: name.trim(),
      enabled,
      trigger,
      actions: [action],
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildPayload();
      if (!selectedCompanyId) throw new Error("No company");
      if (editing) {
        return companiesApi.updateAutomationRule(selectedCompanyId, editing.id, body);
      }
      return companiesApi.createAutomationRule(selectedCompanyId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules", selectedCompanyId] });
      setDialogOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedCompanyId) throw new Error("No company");
      return companiesApi.deleteAutomationRule(selectedCompanyId, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules", selectedCompanyId] });
    },
  });

  const rules = rulesData?.rules ?? [];

  const formError = useMemo(() => {
    if (saveMutation.isError && saveMutation.error instanceof ApiError) {
      return saveMutation.error.message;
    }
    if (saveMutation.isError && saveMutation.error instanceof Error) {
      return saveMutation.error.message;
    }
    return null;
  }, [saveMutation.error, saveMutation.isError]);

  /** API 狀態碼 → 目前語系標籤（與議題／AI 員工列表一致，鍵見 locales `status`） */
  const labelStatusCode = (code: string) => t(`status:${code}`, { defaultValue: code });

  const formatTriggerSummary = (trig: AutomationRuleTrigger) => {
    const anyLabel = t("company:automationAny");
    if (trig.type === "issue_status") {
      const from = trig.fromStatus ? labelStatusCode(trig.fromStatus) : anyLabel;
      const to = labelStatusCode(trig.toStatus);
      return t("company:automationSummaryIssue", { from, to });
    }
    if (trig.type === "budget_policy_breach_first") {
      return trig.policyId
        ? t("company:automationSummaryBudgetPolicy", { id: trig.policyId.slice(0, 8) })
        : t("company:automationSummaryBudgetAny");
    }
    const from = trig.fromStatus ? labelStatusCode(trig.fromStatus) : anyLabel;
    const to = labelStatusCode(trig.toStatus);
    return t("company:automationSummaryAgent", { from, to });
  };

  const formatActionSummary = (a: AutomationRuleAction) => {
    if (a.type === "pause_agent") {
      const targetLabel =
        a.target === "issue_assignee"
          ? t("company:automationPauseIssueAssignee")
          : a.target === "event_agent"
            ? t("company:automationPauseEventAgent")
            : t("company:automationPauseSpecific");
      return t("company:automationSummaryPause", { target: targetLabel });
    }
    if (a.type === "add_issue_labels") {
      return t("company:automationSummaryLabels", { count: a.labelIds.length });
    }
    return t("company:automationSummaryFollowup", { title: a.title.slice(0, 40) });
  };

  return (
    <div className="company-automation">
      <header className="company-automation-header">
        <div>
          <h1 className="company-automation-title">{t("company:automationTitle")}</h1>
          <p className="company-automation-desc">{t("company:automationDesc")}</p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          {t("company:automationAddRule")}
        </Button>
      </header>

      <div className="company-automation-card">
        {isLoading && <p className="company-automation-muted">{t("common:loading")}</p>}
        {!isLoading && rules.length === 0 && (
          <p className="company-automation-muted">{t("company:automationEmpty")}</p>
        )}
        {!isLoading && rules.length > 0 && (
          <table className="company-automation-table">
            <thead>
              <tr>
                <th>{t("company:automationColName")}</th>
                <th>{t("company:automationColTrigger")}</th>
                <th>{t("company:automationColAction")}</th>
                <th>{t("company:automationColEnabled")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const tr = r.trigger as AutomationRuleTrigger;
                const act = (r.actions as AutomationRuleAction[])[0];
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="company-automation-mono">{formatTriggerSummary(tr)}</td>
                    <td className="company-automation-mono">{act ? formatActionSummary(act) : "—"}</td>
                    <td>{r.enabled ? t("common:yes") : t("common:no")}</td>
                    <td className="company-automation-actions">
                      <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)}>
                        {t("common:edit")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="company-automation-danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("company:automationDeleteConfirm"))) {
                            deleteMutation.mutate(r.id);
                          }
                        }}
                      >
                        {t("common:delete")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="company-automation-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("company:automationEditRule") : t("company:automationAddRule")}
            </DialogTitle>
          </DialogHeader>
          <div className="company-automation-form">
            <label className="company-automation-field">
              <span>{t("company:automationName")}</span>
              <input
                className="company-automation-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </label>
            <label className="company-automation-field company-automation-inline">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t("company:automationEnabled")}</span>
            </label>

            <div className="company-automation-field">
              <span>{t("company:automationTrigger")}</span>
              <select
                className="company-automation-input"
                value={triggerKind}
                onChange={(e) => setTriggerKind(e.target.value as AutomationRuleTrigger["type"])}
              >
                <option value="issue_status">{t("company:automationTriggerIssue")}</option>
                <option value="budget_policy_breach_first">{t("company:automationTriggerBudget")}</option>
                <option value="agent_status">{t("company:automationTriggerAgent")}</option>
              </select>
            </div>

            {triggerKind === "issue_status" && (
              <div className="company-automation-row">
                <label className="company-automation-field">
                  <span>{t("company:automationIssueFrom")}</span>
                  <select
                    className="company-automation-input"
                    value={issueFrom}
                    onChange={(e) => setIssueFrom(e.target.value)}
                  >
                    <option value="">{t("company:automationAny")}</option>
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {labelStatusCode(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="company-automation-field">
                  <span>{t("company:automationIssueTo")}</span>
                  <select
                    className="company-automation-input"
                    value={issueTo}
                    onChange={(e) => setIssueTo(e.target.value)}
                  >
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {labelStatusCode(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {triggerKind === "budget_policy_breach_first" && (
              <label className="company-automation-field">
                <span>{t("company:automationBudgetPolicy")}</span>
                <select
                  className="company-automation-input"
                  value={budgetPolicyId}
                  onChange={(e) => setBudgetPolicyId(e.target.value)}
                >
                  <option value="">{t("company:automationAny")}</option>
                  {budgetPolicies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.scopeType} · {p.limitCents}c
                    </option>
                  ))}
                </select>
              </label>
            )}

            {triggerKind === "agent_status" && (
              <div className="company-automation-row">
                <label className="company-automation-field">
                  <span>{t("company:automationAgentFrom")}</span>
                  <select
                    className="company-automation-input"
                    value={agentFrom}
                    onChange={(e) => setAgentFrom(e.target.value)}
                  >
                    <option value="">{t("company:automationAny")}</option>
                    {AGENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {labelStatusCode(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="company-automation-field">
                  <span>{t("company:automationAgentTo")}</span>
                  <select
                    className="company-automation-input"
                    value={agentTo}
                    onChange={(e) => setAgentTo(e.target.value)}
                  >
                    {AGENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {labelStatusCode(s)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="company-automation-field">
              <span>{t("company:automationAction")}</span>
              <select
                className="company-automation-input"
                value={actionKind}
                onChange={(e) => setActionKind(e.target.value as AutomationRuleAction["type"])}
              >
                <option value="add_issue_labels">{t("company:automationActionLabels")}</option>
                <option value="pause_agent">{t("company:automationActionPause")}</option>
                <option value="create_followup_issue">{t("company:automationActionFollowup")}</option>
              </select>
            </div>

            {actionKind === "pause_agent" && (
              <div className="company-automation-field">
                <span>{t("company:automationPauseTarget")}</span>
                <select
                  className="company-automation-input"
                  value={pauseTarget}
                  onChange={(e) =>
                    setPauseTarget(e.target.value as "issue_assignee" | "event_agent" | "specific_agent")
                  }
                >
                  <option value="issue_assignee">{t("company:automationPauseIssueAssignee")}</option>
                  <option value="event_agent">{t("company:automationPauseEventAgent")}</option>
                  <option value="specific_agent">{t("company:automationPauseSpecific")}</option>
                </select>
                {pauseTarget === "specific_agent" && (
                  <input
                    className="company-automation-input company-automation-mt"
                    placeholder="agent UUID"
                    value={pauseAgentId}
                    onChange={(e) => setPauseAgentId(e.target.value)}
                  />
                )}
              </div>
            )}

            {actionKind === "add_issue_labels" && (
              <div className="company-automation-field">
                <span>{t("company:automationPickLabels")}</span>
                <div className="company-automation-label-grid">
                  {labels.map((lb) => (
                    <label key={lb.id} className="company-automation-label-pill">
                      <input
                        type="checkbox"
                        checked={labelIds.includes(lb.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLabelIds((prev) => [...prev, lb.id]);
                          } else {
                            setLabelIds((prev) => prev.filter((id) => id !== lb.id));
                          }
                        }}
                      />
                      <span>{lb.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {actionKind === "create_followup_issue" && (
              <>
                <label className="company-automation-field">
                  <span>{t("company:automationFollowTitle")}</span>
                  <input
                    className="company-automation-input"
                    value={followTitle}
                    onChange={(e) => setFollowTitle(e.target.value)}
                  />
                </label>
                <label className="company-automation-field">
                  <span>{t("company:automationFollowProject")}</span>
                  <select
                    className="company-automation-input"
                    value={followProjectId}
                    onChange={(e) => setFollowProjectId(e.target.value)}
                  >
                    <option value="">{t("company:automationInheritProject")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="company-automation-field company-automation-inline">
                  <input
                    type="checkbox"
                    checked={linkParent}
                    onChange={(e) => setLinkParent(e.target.checked)}
                  />
                  <span>{t("company:automationLinkParent")}</span>
                </label>
              </>
            )}

            {formError && <p className="company-automation-error">{formError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("common:cancel")}
            </Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || !name.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t("common:saving") : t("common:save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
