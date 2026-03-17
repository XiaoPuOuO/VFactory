import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, message, action, onAction }: EmptyStateProps) {
  return (
    <div className="ui-empty-state">
      <div className="ui-empty-state-icon-wrap">
        <Icon />
      </div>
      <p className="ui-empty-state-message">{message}</p>
      {action && onAction && (
        <Button onClick={onAction}>
          <Plus />
          {action}
        </Button>
      )}
    </div>
  );
}
