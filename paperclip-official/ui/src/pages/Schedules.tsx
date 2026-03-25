import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentSchedule, CreateSchedule, UpdateSchedule, ScheduleKind } from "@paperclipai/shared";
import { schedulesApi } from "../api/schedules";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar, Plus, Pencil, Trash2 } from "lucide-react";
import "./Schedules.css";

const SCHEDULE_KINDS: ScheduleKind[] = ["cron", "once", "ranges"];

export function Schedules() {
  const { t } = useTranslation("schedules");
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AgentSchedule | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("pageTitle") }]);
  }, [setBreadcrumbs, t]);

  const { data: schedules, isLoading, error } = useQuery({
    queryKey: queryKeys.schedules.list(selectedCompanyId!),
    queryFn: () => schedulesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: conflicts } = useQuery({
    queryKey: queryKeys.schedules.conflicts(selectedCompanyId!, 7, 60),
    queryFn: () => schedulesApi.conflicts(selectedCompanyId!, 7, 60),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSchedule) =>
      schedulesApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.list(selectedCompanyId!) });
      setDialogOpen(false);
      setEditingSchedule(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: string; data: Parameters<typeof schedulesApi.update>[2] }) =>
      schedulesApi.update(selectedCompanyId!, scheduleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.list(selectedCompanyId!) });
      setDialogOpen(false);
      setEditingSchedule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      schedulesApi.remove(selectedCompanyId!, scheduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.list(selectedCompanyId!) });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Calendar} message={t("selectCompanyToView")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const openCreate = () => {
    setEditingSchedule(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule: AgentSchedule) => {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  };

  const agentName = (id: string) => agents?.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="schedules-page">
      {error && <p className="schedules-error">{error.message}</p>}

      {conflicts && conflicts.length > 0 && (
        <div className="schedules-conflicts" role="region" aria-label={t("conflictsTitle")}>
          <h2 className="schedules-conflicts-title">{t("conflictsTitle")}</h2>
          <p className="schedules-conflicts-hint">
            {t("conflictsHorizon", { days: 7, sec: 60 })}
          </p>
          <ul className="schedules-conflicts-list">
            {conflicts.map((c) => (
              <li key={`${c.scheduleIdA}-${c.scheduleIdB}`} className="schedules-conflicts-item">
                <span className="schedules-conflicts-agent">{agentName(c.agentId)}</span>
                <span className="schedules-conflicts-meta">
                  {t("conflictsDelta", { sec: Math.round(c.deltaSec) })} · A {c.scheduleIdA.slice(0, 8)}… / B{" "}
                  {c.scheduleIdB.slice(0, 8)}…
                </span>
                <span className="schedules-conflicts-times">
                  {new Date(c.nextFireAtA).toLocaleString()} · {new Date(c.nextFireAtB).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {schedules && schedules.length === 0 && (
        <div className="schedules-empty-wrap">
          <div className="schedules-empty-card">
            <div className="schedules-empty-icon-wrap">
              <Calendar strokeWidth={1.5} />
            </div>
            <h2 className="schedules-empty-title">
              {t("noSchedulesYet")}
            </h2>
            <p className="schedules-empty-desc">
              {t("noSchedulesYetDesc")}
            </p>
            <Button onClick={openCreate} size="default" className="schedules-empty-btn">
              <Plus strokeWidth={2} />
              {t("newSchedule")}
            </Button>
          </div>
        </div>
      )}

      {schedules && schedules.length > 0 && (
        <>
          <div className="schedules-toolbar">
            <Button size="sm" variant="outline" onClick={openCreate} className="schedules-toolbar-btn">
              <Plus />
              {t("newSchedule")}
            </Button>
          </div>
          <ScheduleList
            schedules={schedules}
            agents={agents ?? []}
            onEdit={openEdit}
            onDelete={(id) => deleteMutation.mutate(id)}
            isDeleting={(id) => deleteMutation.isPending && deleteMutation.variables === id}
            t={t}
          />
        </>
      )}

      <ScheduleFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingSchedule(null);
          setDialogOpen(open);
        }}
        companyId={selectedCompanyId}
        agents={agents ?? []}
        editing={editingSchedule}
        onCreate={createMutation.mutate}
        onUpdate={updateMutation.mutate}
        isPending={createMutation.isPending || updateMutation.isPending}
        t={t}
      />
    </div>
  );
}

function ScheduleList({
  schedules,
  agents,
  onEdit,
  onDelete,
  isDeleting,
  t,
}: {
  schedules: AgentSchedule[];
  agents: Array<{ id: string; name: string }>;
  onEdit: (s: AgentSchedule) => void;
  onDelete: (id: string) => void;
  isDeleting: (id: string) => boolean;
  t: (key: string) => string;
}) {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  return (
    <div className="schedules-table-wrap">
      <table className="schedules-table">
        <thead>
          <tr>
            <th>{t("name")}</th>
            <th>{t("agent")}</th>
            <th>{t("kind")}</th>
            <th>{t("nextRun")}</th>
            <th>{t("enabled")}</th>
            <th className="actions" />
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => (
            <tr key={s.id}>
              <td className="name">{s.name}</td>
              <td className="muted">
                {agentById.get(s.agentId)?.name ?? s.agentId.slice(0, 8)}
              </td>
              <td>{s.scheduleKind}</td>
              <td className="muted">
                {s.nextRunAt
                  ? new Date(s.nextRunAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })
                  : "—"}
              </td>
              <td>
                <span
                  className={`schedules-enabled-badge ${s.enabled ? "enabled" : "disabled"}`}
                >
                  {s.enabled ? t("yes") : t("no")}
                </span>
              </td>
              <td>
                <div className="schedules-actions">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onEdit(s)}
                    aria-label={t("edit")}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(s.id)}
                    disabled={isDeleting(s.id)}
                    aria-label={t("delete")}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScheduleFormDialog({
  open,
  onOpenChange,
  companyId,
  agents,
  editing,
  onCreate,
  onUpdate,
  isPending,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  agents: Array<{ id: string; name: string }>;
  editing: AgentSchedule | null;
  onCreate: (data: CreateSchedule) => void;
  onUpdate: (params: { scheduleId: string; data: UpdateSchedule }) => void;
  isPending: boolean;
  t: (key: string) => string;
}) {
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("cron");
  const [timezone, setTimezone] = useState("UTC");
  const [enabled, setEnabled] = useState(true);
  const [cronExpression, setCronExpression] = useState("0 8 * * *");
  const [runAt, setRunAt] = useState("");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [windows, setWindows] = useState<Array<{ start: string; end: string }>>([
    { start: "", end: "" },
  ]);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setAgentId(editing.agentId);
      setScheduleKind(editing.scheduleKind);
      setTimezone(editing.timezone);
      setEnabled(editing.enabled);
      setCronExpression(editing.cronExpression ?? "0 8 * * *");
      setRunAt(editing.runAt ? editing.runAt.slice(0, 16) : "");
      setTimeOfDay(editing.timeOfDay ?? "09:00");
      setWindows(
        editing.windows?.length
          ? editing.windows
          : [{ start: "", end: "" }],
      );
    } else {
      setName("");
      setAgentId(agents[0]?.id ?? "");
      setScheduleKind("cron");
      setTimezone("UTC");
      setEnabled(true);
      setCronExpression("0 8 * * *");
      setRunAt("");
      setTimeOfDay("09:00");
      setWindows([{ start: "", end: "" }]);
    }
  }, [editing, agents, open]);

  const handleSubmit = () => {
    if (!name.trim() || !agentId) return;
    if (editing) {
      onUpdate({
        scheduleId: editing.id,
        data: {
          name: name.trim(),
          timezone,
          enabled,
          ...(scheduleKind === "cron" && { cronExpression }),
          ...(scheduleKind === "once" && { runAt: runAt ? new Date(runAt).toISOString() : null }),
          ...(scheduleKind === "ranges" && {
            timeOfDay,
            windows: windows.filter((w) => w.start && w.end),
          }),
        },
      });
    } else {
      const payload: CreateSchedule = {
        agentId,
        name: name.trim(),
        scheduleKind,
        timezone,
        enabled,
      };
      if (scheduleKind === "cron") payload.cronExpression = cronExpression;
      if (scheduleKind === "once" && runAt) payload.runAt = new Date(runAt).toISOString();
      if (scheduleKind === "ranges") {
        payload.timeOfDay = timeOfDay;
        payload.windows = windows.filter((w) => w.start && w.end);
      }
      onCreate(payload);
    }
  };

  const addWindow = () => setWindows((w) => [...w, { start: "", end: "" }]);
  const removeWindow = (i: number) =>
    setWindows((w) => w.length > 1 ? w.filter((_, j) => j !== i) : w);
  const setWindow = (i: number, field: "start" | "end", value: string) =>
    setWindows((w) => w.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="schedules-dialog-content">
        <DialogHeader>
          <DialogTitle>{editing ? t("editSchedule") : t("newSchedule")}</DialogTitle>
        </DialogHeader>
        <div className="schedules-form">
          <div className="schedules-form-group">
            <label>{t("name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <div className="schedules-form-group">
            <label>{t("agent")}</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              disabled={!!editing}
            >
              <option value="">{t("selectAgent")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="schedules-form-group">
            <label>{t("timezone")}</label>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/New_York"
            />
          </div>
          <div className="schedules-form-group">
            <label>{t("kind")}</label>
            <select
              value={scheduleKind}
              onChange={(e) => setScheduleKind(e.target.value as ScheduleKind)}
              disabled={!!editing}
            >
              {SCHEDULE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
          </div>

          {scheduleKind === "cron" && (
            <div className="schedules-form-group">
              <label>{t("cronExpression")}</label>
              <input
                className="font-mono"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 8 * * *"
              />
              <p className="schedules-form-hint">{t("cronHint")}</p>
            </div>
          )}

          {scheduleKind === "once" && (
            <div className="schedules-form-group">
              <label>{t("runAt")}</label>
              <input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
          )}

          {scheduleKind === "ranges" && (
            <>
              <div className="schedules-form-group">
                <label>{t("timeOfDay")}</label>
                <input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                />
              </div>
              <div className="schedules-form-group">
                <label>{t("windows")}</label>
                {windows.map((w, i) => (
                  <div key={i} className="schedules-form-row">
                    <input
                      type="date"
                      value={w.start}
                      onChange={(e) => setWindow(i, "start", e.target.value)}
                    />
                    <span style={{ color: "var(--muted-foreground)" }}>–</span>
                    <input
                      type="date"
                      value={w.end}
                      onChange={(e) => setWindow(i, "end", e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeWindow(i)}
                      aria-label={t("removeWindow")}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="schedules-add-window-btn" onClick={addWindow}>
                  {t("addWindow")}
                </Button>
              </div>
            </>
          )}

          <div className="schedules-form-checkbox-row">
            <input
              type="checkbox"
              id="schedule-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor="schedule-enabled">{t("enabled")}</label>
          </div>
        </div>
        <div className="schedules-form-footer">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {editing ? t("save") : t("create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
