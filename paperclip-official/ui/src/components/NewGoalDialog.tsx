import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GOAL_STATUSES,
  GOAL_LEVELS,
  GOAL_RECURRENCES,
  GOAL_RECURRENCE_INTERVAL_DAYS_MAX,
  GOAL_RECURRENCE_INTERVAL_HOURS_MAX,
  GOAL_RECURRENCE_INTERVAL_MINUTES_MAX,
  GOAL_RECURRENCE_INTERVAL_SECONDS_MAX,
} from "@paperclipai/shared";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { goalsApi } from "../api/goals";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Maximize2,
  Minimize2,
  Target,
  Layers,
  Repeat,
} from "lucide-react";
import { MarkdownEditor, type MarkdownEditorRef } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";

const GOAL_LEVEL_KEYS: Record<string, string> = {
  company: "goals.levelCompany",
  team: "goals.levelTeam",
  agent: "goals.levelAgent",
  task: "goals.levelTask",
};

const GOAL_STATUS_KEYS: Record<string, string> = {
  planned: "goals.statusPlanned",
  active: "goals.statusActive",
  achieved: "goals.statusAchieved",
  cancelled: "goals.statusCancelled",
};

const GOAL_RECURRENCE_KEYS: Record<string, string> = {
  one_time: "goals.recurrenceOneTime",
  daily: "goals.recurrenceDaily",
  weekly: "goals.recurrenceWeekly",
  monthly: "goals.recurrenceMonthly",
  custom: "goals.recurrenceCustom",
};

export function NewGoalDialog() {
  const { t } = useTranslation();
  const { newGoalOpen, newGoalDefaults, closeNewGoal } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [level, setLevel] = useState("task");
  const [recurrence, setRecurrence] = useState<"one_time" | "daily" | "weekly" | "monthly" | "custom">("one_time");
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(0);
  const [recurrenceIntervalHours, setRecurrenceIntervalHours] = useState(0);
  const [recurrenceIntervalMinutes, setRecurrenceIntervalMinutes] = useState(0);
  const [recurrenceIntervalSeconds, setRecurrenceIntervalSeconds] = useState(0);
  const [parentId, setParentId] = useState("");
  const [expanded, setExpanded] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [levelOpen, setLevelOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);

  // Apply defaults when dialog opens
  const appliedParentId = parentId || newGoalDefaults.parentId || "";

  const { data: goals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newGoalOpen,
  });

  const createGoal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      goalsApi.create(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(selectedCompanyId!) });
      reset();
      closeNewGoal();
    },
  });

  const uploadDescriptionImage = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(selectedCompanyId, file, "goals/drafts");
    },
  });

  function reset() {
    setTitle("");
    setDescription("");
    setStatus("planned");
    setLevel("task");
    setRecurrence("one_time");
    setRecurrenceIntervalDays(0);
    setRecurrenceIntervalHours(0);
    setRecurrenceIntervalMinutes(0);
    setRecurrenceIntervalSeconds(0);
    setParentId("");
    setExpanded(false);
  }

  const isCustomIntervalValid =
    recurrence !== "custom" ||
    recurrenceIntervalDays > 0 ||
    recurrenceIntervalHours > 0 ||
    recurrenceIntervalMinutes > 0 ||
    recurrenceIntervalSeconds > 0;

  function handleSubmit() {
    if (!selectedCompanyId || !title.trim() || !isCustomIntervalValid) return;
    createGoal.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      level,
      recurrence,
      recurrenceIntervalDays: recurrence === "custom" ? recurrenceIntervalDays : undefined,
      recurrenceIntervalHours: recurrence === "custom" ? recurrenceIntervalHours : undefined,
      recurrenceIntervalMinutes: recurrence === "custom" ? recurrenceIntervalMinutes : undefined,
      recurrenceIntervalSeconds: recurrence === "custom" ? recurrenceIntervalSeconds : undefined,
      ...(appliedParentId ? { parentId: appliedParentId } : {}),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  const currentParent = (goals ?? []).find((g) => g.id === appliedParentId);

  return (
    <Dialog
      open={newGoalOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeNewGoal();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={["ui-form-dialog-content", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="ui-form-dialog-header">
          <div className="ui-form-dialog-header-left">
            {selectedCompany && (
              <span className="ui-form-dialog-header-company">
                {selectedCompany.name.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="ui-form-dialog-header-sep">&rsaquo;</span>
            <span>{newGoalDefaults.parentId ? t("goals.newSubGoal") : t("goals.newGoal")}</span>
          </div>
          <div className="ui-form-dialog-header-actions">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => { reset(); closeNewGoal(); }}
            >
              <span className="ui-form-dialog-close-char">&times;</span>
            </Button>
          </div>
        </div>

        {/* Title */}
        <div className="ui-form-dialog-title-wrap">
          <input
            className="ui-form-dialog-title-input"
            placeholder={t("goals.goalTitlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                descriptionEditorRef.current?.focus();
              }
            }}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="ui-form-dialog-body">
          <MarkdownEditor
            ref={descriptionEditorRef}
            value={description}
            onChange={setDescription}
            placeholder={t("goals.addDescriptionPlaceholder")}
            bordered={false}
            contentClassName={["ui-form-dialog-content-editor", expanded ? "expanded" : ""].filter(Boolean).join(" ")}
            imageUploadHandler={async (file) => {
              const asset = await uploadDescriptionImage.mutateAsync(file);
              return asset.contentPath;
            }}
          />
        </div>

        {/* Property chips */}
        <div className="ui-form-dialog-chips">
          {/* Status */}
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <StatusBadge status={status} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-40" align="start">
              {GOAL_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={["ui-form-dialog-popover-item", s === status ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setStatus(s); setStatusOpen(false); }}
                >
                  {GOAL_STATUS_KEYS[s] ? t(GOAL_STATUS_KEYS[s]) : s}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Level */}
          <Popover open={levelOpen} onOpenChange={setLevelOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <Layers className="ui-form-dialog-chip-icon" />
                {GOAL_LEVEL_KEYS[level] ? t(GOAL_LEVEL_KEYS[level]) : level}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-40" align="start">
              {GOAL_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={["ui-form-dialog-popover-item", l === level ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setLevel(l); setLevelOpen(false); }}
                >
                  {GOAL_LEVEL_KEYS[l] ? t(GOAL_LEVEL_KEYS[l]) : l}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Recurrence */}
          <Popover open={recurrenceOpen} onOpenChange={setRecurrenceOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <Repeat className="ui-form-dialog-chip-icon" />
                {recurrence === "custom"
                  ? t("goals.recurrenceIntervalLabel", {
                      days: recurrenceIntervalDays,
                      hours: recurrenceIntervalHours,
                      minutes: recurrenceIntervalMinutes,
                      seconds: recurrenceIntervalSeconds,
                    })
                  : (GOAL_RECURRENCE_KEYS[recurrence] ? t(GOAL_RECURRENCE_KEYS[recurrence]) : recurrence)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-56" align="start">
              <div className="ui-form-dialog-popover-list">
                {GOAL_RECURRENCES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={["ui-form-dialog-popover-item", r === recurrence ? "active" : ""].filter(Boolean).join(" ")}
                    onClick={() => { setRecurrence(r); if (r !== "custom") setRecurrenceOpen(false); }}
                  >
                    {GOAL_RECURRENCE_KEYS[r] ? t(GOAL_RECURRENCE_KEYS[r]) : r}
                  </button>
                ))}
              </div>
              {recurrence === "custom" && (
                <div className="ui-form-dialog-recurrence-custom">
                  <div className="ui-form-dialog-recurrence-grid">
                    <div className="ui-form-dialog-recurrence-field">
                      <label>{t("goals.recurrenceIntervalDays")}</label>
                      <input
                        type="number"
                        min={0}
                        max={GOAL_RECURRENCE_INTERVAL_DAYS_MAX}
                        value={recurrenceIntervalDays}
                        onChange={(e) => setRecurrenceIntervalDays(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="ui-form-dialog-recurrence-field">
                      <label>{t("goals.recurrenceIntervalHours")}</label>
                      <input
                        type="number"
                        min={0}
                        max={GOAL_RECURRENCE_INTERVAL_HOURS_MAX}
                        value={recurrenceIntervalHours}
                        onChange={(e) => setRecurrenceIntervalHours(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="ui-form-dialog-recurrence-field">
                      <label>{t("goals.recurrenceIntervalMinutes")}</label>
                      <input
                        type="number"
                        min={0}
                        max={GOAL_RECURRENCE_INTERVAL_MINUTES_MAX}
                        value={recurrenceIntervalMinutes}
                        onChange={(e) => setRecurrenceIntervalMinutes(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                    <div className="ui-form-dialog-recurrence-field">
                      <label>{t("goals.recurrenceIntervalSeconds")}</label>
                      <input
                        type="number"
                        min={0}
                        max={GOAL_RECURRENCE_INTERVAL_SECONDS_MAX}
                        value={recurrenceIntervalSeconds}
                        onChange={(e) => setRecurrenceIntervalSeconds(parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>
                  {!isCustomIntervalValid && (
                    <p className="ui-form-dialog-recurrence-error">{t("goals.recurrenceIntervalAllZero")}</p>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Parent goal */}
          <Popover open={parentOpen} onOpenChange={setParentOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="ui-form-dialog-chip">
                <Target className="ui-form-dialog-chip-icon" />
                {currentParent ? currentParent.title : t("goals.parentGoal")}
              </button>
            </PopoverTrigger>
            <PopoverContent className="ui-form-dialog-popover-content w-48" align="start">
              <button
                type="button"
                className={["ui-form-dialog-popover-item", !appliedParentId ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => { setParentId(""); setParentOpen(false); }}
              >
                {t("goals.noParent")}
              </button>
              {(goals ?? []).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={["ui-form-dialog-popover-item truncate", g.id === appliedParentId ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => { setParentId(g.id); setParentOpen(false); }}
                >
                  {g.title}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Footer */}
        <div className="ui-form-dialog-footer">
          <Button
            size="sm"
            disabled={!title.trim() || !isCustomIntervalValid || createGoal.isPending}
            onClick={handleSubmit}
          >
            {createGoal.isPending ? t("goals.creating") : newGoalDefaults.parentId ? t("goals.createSubGoal") : t("goals.createGoal")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
