import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusIconProps {
  status: string;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function StatusIcon({ status, onChange, className, showLabel }: StatusIconProps) {
  const [open, setOpen] = useState(false);
  const isDone = status === "done";

  const circle = (
    <span
      className={`ui-status-icon ${onChange && !showLabel ? "clickable" : ""} ${className ?? ""}`}
      data-status={status}
    >
      {isDone && <span className="ui-status-icon-dot" />}
    </span>
  );

  if (!onChange) {
    return showLabel ? (
      <span className="ui-status-icon-with-label">
        {circle}
        <span>{statusLabel(status)}</span>
      </span>
    ) : (
      circle
    );
  }

  const trigger = showLabel ? (
    <button type="button" className="ui-status-icon-trigger">
      {circle}
      <span>{statusLabel(status)}</span>
    </button>
  ) : (
    circle
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="ui-status-popover-content" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={`ui-status-popover-item ${s === status ? "active" : ""}`}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} />
            {statusLabel(s)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
