import { useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { Goal } from "@paperclipai/shared";
import { GOAL_STATUSES, GOAL_LEVELS, GOAL_RECURRENCES } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { goalsApi } from "../api/goals";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "./StatusBadge";
import { formatDate, agentUrl } from "../lib/utils";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { InlineEditor } from "./InlineEditor";
import { MarkdownBody } from "./MarkdownBody";

interface GoalPropertiesProps {
  goal: Goal;
  onUpdate?: (data: Record<string, unknown>) => void;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ui-properties-row">
      <span className="ui-properties-label">{label}</span>
      <div className="ui-properties-value">{children}</div>
    </div>
  );
}

function label(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PickerButton({
  current,
  options,
  onChange,
  children,
}: {
  current: string;
  options: readonly string[];
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="ui-properties-picker-trigger">
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="ui-properties-picker-content" align="end">
        {options.map((opt) => (
          <Button
            key={opt}
            variant="ghost"
            size="sm"
            className={["ui-properties-picker-item", opt === current ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              onChange(opt);
              setOpen(false);
            }}
          >
            {label(opt)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const RECURRENCE_I18N: Record<string, string> = {
  one_time: "goals.recurrenceOneTime",
  daily: "goals.recurrenceDaily",
  weekly: "goals.recurrenceWeekly",
  monthly: "goals.recurrenceMonthly",
  custom: "goals.recurrenceCustom",
};

export function GoalProperties({ goal, onUpdate }: GoalPropertiesProps) {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const recurrence = goal.recurrence ?? "one_time";

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(selectedCompanyId!),
    queryFn: () => goalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const ownerAgent = goal.ownerAgentId
    ? agents?.find((a) => a.id === goal.ownerAgentId)
    : null;

  const parentGoal = goal.parentId
    ? allGoals?.find((g) => g.id === goal.parentId)
    : null;

  return (
    <div className="ui-properties">
      <div className="ui-properties-section">
        <PropertyRow label="Status">
          {onUpdate ? (
            <PickerButton
              current={goal.status}
              options={GOAL_STATUSES}
              onChange={(status) => onUpdate({ status })}
            >
              <StatusBadge status={goal.status} />
            </PickerButton>
          ) : (
            <StatusBadge status={goal.status} />
          )}
        </PropertyRow>

        <PropertyRow label="Level">
          {onUpdate ? (
            <PickerButton
              current={goal.level}
              options={GOAL_LEVELS}
              onChange={(level) => onUpdate({ level })}
            >
              <span className="ui-properties-text capitalize">{goal.level}</span>
            </PickerButton>
          ) : (
            <span className="ui-properties-text capitalize">{goal.level}</span>
          )}
        </PropertyRow>

        <PropertyRow label="Description">
          {onUpdate ? (
            <InlineEditor
              value={goal.description ?? ""}
              onSave={(description) => onUpdate({ description })}
              as="p"
              placeholder={t("goals.addDescriptionPlaceholder")}
              multiline
              className="ui-properties-inline-editor-description"
            />
          ) : goal.description ? (
            <MarkdownBody>{goal.description}</MarkdownBody>
          ) : (
            <span className="ui-properties-muted">{t("project.noDescription")}</span>
          )}
        </PropertyRow>

        <PropertyRow label={t("goals.recurrence")}>
          {onUpdate ? (
            <PickerButton
              current={recurrence}
              options={[...GOAL_RECURRENCES]}
              onChange={(value) => {
                if (value === "custom") {
                  onUpdate({
                    recurrence: "custom",
                    recurrenceIntervalDays: goal.recurrenceIntervalDays || 1,
                    recurrenceIntervalHours: goal.recurrenceIntervalHours ?? 0,
                    recurrenceIntervalMinutes: goal.recurrenceIntervalMinutes ?? 0,
                    recurrenceIntervalSeconds: goal.recurrenceIntervalSeconds ?? 0,
                  });
                } else {
                  onUpdate({ recurrence: value });
                }
              }}
            >
              <span className="ui-properties-text">
                {recurrence === "custom"
                  ? t("goals.recurrenceIntervalLabel", {
                      days: goal.recurrenceIntervalDays ?? 0,
                      hours: goal.recurrenceIntervalHours ?? 0,
                      minutes: goal.recurrenceIntervalMinutes ?? 0,
                      seconds: goal.recurrenceIntervalSeconds ?? 0,
                    })
                  : (RECURRENCE_I18N[recurrence] ? t(RECURRENCE_I18N[recurrence]) : recurrence)}
              </span>
            </PickerButton>
          ) : (
            <span className="ui-properties-text">
              {recurrence === "custom"
                ? t("goals.recurrenceIntervalLabel", {
                    days: goal.recurrenceIntervalDays ?? 0,
                    hours: goal.recurrenceIntervalHours ?? 0,
                    minutes: goal.recurrenceIntervalMinutes ?? 0,
                    seconds: goal.recurrenceIntervalSeconds ?? 0,
                  })
                : (RECURRENCE_I18N[recurrence] ? t(RECURRENCE_I18N[recurrence]) : recurrence)}
            </span>
          )}
        </PropertyRow>

        <PropertyRow label="Owner">
          {ownerAgent ? (
            <Link to={agentUrl(ownerAgent)} className="ui-properties-link">
              {ownerAgent.name}
            </Link>
          ) : (
            <span className="ui-properties-muted">None</span>
          )}
        </PropertyRow>

        {goal.parentId && (
          <PropertyRow label="Parent Goal">
            <Link to={`/goals/${goal.parentId}`} className="ui-properties-link">
              {parentGoal?.title ?? goal.parentId.slice(0, 8)}
            </Link>
          </PropertyRow>
        )}
      </div>

      <Separator />

      <div className="ui-properties-section">
        <PropertyRow label="Created">
          <span className="ui-properties-text">{formatDate(goal.createdAt)}</span>
        </PropertyRow>
        <PropertyRow label="Updated">
          <span className="ui-properties-text">{formatDate(goal.updatedAt)}</span>
        </PropertyRow>
      </div>
    </div>
  );
}
