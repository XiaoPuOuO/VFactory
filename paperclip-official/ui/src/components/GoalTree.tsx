import type { Goal } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { StatusBadge } from "./StatusBadge";
import { ChevronRight, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "@/api/goals";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "./GoalTree.css";

interface GoalTreeProps {
  goals: Goal[];
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
}

interface GoalNodeProps {
  goal: Goal;
  children: Goal[];
  allGoals: Goal[];
  depth: number;
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
  onRequestDelete?: (goal: Goal) => void;
}

function GoalNode({ goal, children, allGoals, depth, goalLink, onSelect, onRequestDelete }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;
  const link = goalLink?.(goal);
  const { t } = useTranslation("goals");

  const inner = (
    <>
      {hasChildren ? (
        <button
          className="goal-node-expander"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <ChevronRight
            className={cn("goal-node-chevron", expanded && "expanded")}
          />
        </button>
      ) : (
        <span className="goal-node-icon-placeholder" />
      )}
      <span className="goal-node-level">{goal.level}</span>
      <span className="goal-node-title">{goal.title}</span>
      <StatusBadge status={goal.status} />
      <span className="goal-node-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="goal-node-actions-btn"
              aria-label={t("moreActionsAria", { title: goal.title })}
              onClick={(e) => {
                // Prevent row navigation/selection when opening the menu.
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreHorizontal className="goal-node-actions-icon" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRequestDelete?.(goal);
              }}
            >
              <Trash2 className="goal-node-menu-icon" />
              {t("deleteGoal")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </>
  );

  const classes = "goal-node-row";

  return (
    <div className="goal-node-container">
      {link ? (
        <Link
          to={link}
          className={classes}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          {inner}
        </Link>
      ) : (
        <div
          className={classes}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelect?.(goal)}
        >
          {inner}
        </div>
      )}
      {hasChildren && expanded && (
        <div className="goal-node-children">
          {children.map((child) => (
            <GoalNode
              key={child.id}
              goal={child}
              children={allGoals.filter((g) => g.parentId === child.id)}
              allGoals={allGoals}
              depth={depth + 1}
              goalLink={goalLink}
              onSelect={onSelect}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({ goals, goalLink, onSelect }: GoalTreeProps) {
  const { t } = useTranslation("goals");
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState<Goal | null>(null);

  const roots = useMemo(() => {
    const goalIds = new Set(goals.map((g) => g.id));
    return goals.filter((g) => !g.parentId || !goalIds.has(g.parentId));
  }, [goals]);

  const deleteMut = useMutation({
    mutationFn: async (goalId: string) => goalsApi.remove(goalId),
    onSuccess: (deleted) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(deleted.companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.detail(deleted.id) });
      queryClient.invalidateQueries({ queryKey: ["goals", "progress", deleted.id] });
      pushToast({
        title: t("deletedToastTitle"),
        body: t("deletedToastBody", { title: deleted.title }),
        tone: "success",
      });
      setDeleteOpen(false);
      setPendingDeleteGoal(null);
    },
    onError: (err) => {
      pushToast({
        title: t("deleteFailedToastTitle"),
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  if (goals.length === 0) {
    return <p className="goal-tree-empty">No goals.</p>;
  }

  return (
    <>
      <div className="goal-tree-wrapper">
        {roots.map((goal) => (
          <GoalNode
            key={goal.id}
            goal={goal}
            children={goals.filter((g) => g.parentId === goal.id)}
            allGoals={goals}
            depth={0}
            goalLink={goalLink}
            onSelect={onSelect}
            onRequestDelete={(g) => {
              setPendingDeleteGoal(g);
              setDeleteOpen(true);
            }}
          />
        ))}
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setPendingDeleteGoal(null);
        }}
      >
        <DialogContent className="goal-delete-dialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmBody", { title: pendingDeleteGoal?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="goal-delete-dialog-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMut.isPending}
            >
              {t("deleteCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!pendingDeleteGoal || deleteMut.isPending}
              onClick={() => {
                if (!pendingDeleteGoal) return;
                deleteMut.mutate(pendingDeleteGoal.id);
              }}
            >
              {deleteMut.isPending ? t("deleting") : t("deleteConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
