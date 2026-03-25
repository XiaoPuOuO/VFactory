import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation("nav");

  const rows: { id: string; keys: string; label: string }[] = [
    { id: "palette", keys: t("shortcuts.openPalette"), label: t("shortcuts.openPaletteDesc") },
    { id: "issue", keys: t("shortcuts.newIssue"), label: t("shortcuts.newIssueDesc") },
    { id: "sidebar", keys: t("shortcuts.toggleSidebar"), label: t("shortcuts.toggleSidebarDesc") },
    { id: "panel", keys: t("shortcuts.togglePanel"), label: t("shortcuts.togglePanelDesc") },
    { id: "help", keys: t("shortcuts.showHelp"), label: t("shortcuts.showHelpDesc") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="keyboard-shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>{t("shortcuts.title")}</DialogTitle>
        </DialogHeader>
        <ul className="keyboard-shortcuts-list">
          {rows.map((row) => (
            <li key={row.id} className="keyboard-shortcuts-row">
              <kbd className="keyboard-shortcuts-kbd">{row.keys}</kbd>
              <span className="keyboard-shortcuts-label">{row.label}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
