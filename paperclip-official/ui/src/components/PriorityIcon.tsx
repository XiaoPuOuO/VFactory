import { useState } from "react";
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const priorityConfig: Record<string, { icon: typeof ArrowUp; label: string }> = {
  critical: { icon: AlertTriangle, label: "Critical" },
  high: { icon: ArrowUp, label: "High" },
  medium: { icon: Minus, label: "Medium" },
  low: { icon: ArrowDown, label: "Low" },
};

const allPriorities = ["critical", "high", "medium", "low"];

interface PriorityIconProps {
  priority: string;
  onChange?: (priority: string) => void;
  className?: string;
  showLabel?: boolean;
}

export function PriorityIcon({ priority, onChange, className, showLabel }: PriorityIconProps) {
  const [open, setOpen] = useState(false);
  const config = priorityConfig[priority] ?? priorityConfig.medium!;
  const Icon = config.icon;

  const icon = (
    <span
      className={`ui-priority-icon ${onChange && !showLabel ? "clickable" : ""} ${className ?? ""}`}
      data-priority={priority}
    >
      <Icon />
    </span>
  );

  if (!onChange) {
    return showLabel ? (
      <span className="ui-priority-icon-with-label ui-status-icon-with-label">
        {icon}
        <span>{config.label}</span>
      </span>
    ) : (
      icon
    );
  }

  const trigger = showLabel ? (
    <button type="button" className="ui-priority-icon-trigger ui-status-icon-trigger">
      {icon}
      <span>{config.label}</span>
    </button>
  ) : (
    icon
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="ui-priority-popover-content" align="start">
        {allPriorities.map((p) => {
          const c = priorityConfig[p]!;
          const PIcon = c.icon;
          return (
            <Button
              key={p}
              variant="ghost"
              size="sm"
              className={`ui-priority-popover-item ${p === priority ? "active" : ""}`}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <PIcon className="ui-priority-icon" data-priority={p} />
              {c.label}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
