import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Apple, Monitor, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Platform = "mac" | "windows" | "linux";

const platformIds: { id: Platform; labelKey: string; icon: typeof Apple }[] = [
  { id: "mac", labelKey: "mac", icon: Apple },
  { id: "windows", labelKey: "windows", icon: Monitor },
  { id: "linux", labelKey: "linux", icon: Terminal },
];

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_KEYS: Record<Platform, string[]> = {
  mac: ["macStep1", "macStep2", "macStep3", "macStep4"],
  windows: ["windowsStep1", "windowsStep2", "windowsStep3"],
  linux: ["linuxStep1", "linuxStep2", "linuxStep3"],
};

const TIP_KEYS: Record<Platform, string> = {
  mac: "macTip",
  windows: "windowsTip",
  linux: "linuxTip",
};

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
  const { t } = useTranslation("pathInstructions");
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const stepKeys = STEP_KEYS[platform];
  const tipKey = TIP_KEYS[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { example: "/Users/you/project" })}
          </DialogDescription>
        </DialogHeader>

        {/* Platform tabs */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {platformIds.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                platform === p.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon className="h-3.5 w-3.5" />
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-2 text-sm">
          {stepKeys.map((key, i) => (
            <li key={key} className="flex gap-2">
              <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>

        {tipKey && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
            {t(tipKey)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small "Choose" button that opens the PathInstructionsModal.
 * Drop-in replacement for the old showDirectoryPicker buttons.
 */
export function ChoosePathButton({ className, disabled }: { className?: string; disabled?: boolean }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0",
          disabled && "opacity-50 cursor-not-allowed",
          className,
        )}
        onClick={() => !disabled && setOpen(true)}
      >
        {t("choose")}
      </button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
