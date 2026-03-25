import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "../lib/utils";
import "./RunTranscriptUxLab.css";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { RunTranscriptView, type TranscriptDensity, type TranscriptMode } from "../components/transcript/RunTranscriptView";
import { runTranscriptFixtureEntries, runTranscriptFixtureMeta } from "../fixtures/runTranscriptFixtures";
import { ExternalLink, FlaskConical, LayoutPanelLeft, MonitorCog, PanelsTopLeft, RadioTower } from "lucide-react";

type SurfaceId = "detail" | "live" | "dashboard";

const surfaceOptions: Array<{
  id: SurfaceId;
  label: string;
  eyebrow: string;
  description: string;
  icon: typeof LayoutPanelLeft;
}> = [
  {
    id: "detail",
    label: "Run Detail",
    eyebrow: "Full transcript",
    description: "The long-form run page with the `Nice | Raw` toggle and the most inspectable transcript view.",
    icon: MonitorCog,
  },
  {
    id: "live",
    label: "Issue Widget",
    eyebrow: "Live stream",
    description: "The issue-detail live run widget, optimized for following an active run without leaving the task page.",
    icon: RadioTower,
  },
  {
    id: "dashboard",
    label: "Dashboard Card",
    eyebrow: "Dense card",
    description: "The active-agents dashboard card, tuned for compact scanning while keeping the same transcript language.",
    icon: PanelsTopLeft,
  },
];

function previewEntries(surface: SurfaceId) {
  if (surface === "dashboard") {
    return runTranscriptFixtureEntries.slice(-9);
  }
  if (surface === "live") {
    return runTranscriptFixtureEntries.slice(-14);
  }
  return runTranscriptFixtureEntries;
}

function RunDetailPreview({
  mode,
  streaming,
  density,
}: {
  mode: TranscriptMode;
  streaming: boolean;
  density: TranscriptDensity;
}) {
  return (
    <div className="run-detail-preview">
      <div className="run-detail-header">
        <div className="run-detail-meta">
          <Badge variant="outline" className="uppercase tracking-[0.18em] text-[10px]">
            Run Detail
          </Badge>
          <StatusBadge status={streaming ? "running" : "succeeded"} />
          <span className="run-detail-meta-date">
            {formatDateTime(runTranscriptFixtureMeta.startedAt)}
          </span>
        </div>
        <div className="run-detail-title">
          Transcript ({runTranscriptFixtureEntries.length})
        </div>
      </div>
      <div className="run-detail-body">
        <RunTranscriptView
          entries={runTranscriptFixtureEntries}
          mode={mode}
          density={density}
          streaming={streaming}
        />
      </div>
    </div>
  );
}

function LiveWidgetPreview({
  streaming,
  mode,
  density,
}: {
  streaming: boolean;
  mode: TranscriptMode;
  density: TranscriptDensity;
}) {
  return (
    <div className="live-widget-preview">
      <div className="live-widget-header">
        <div className="live-widget-title">
          Live Runs
        </div>
        <div className="live-widget-subtitle">
          Compact live transcript stream for the issue detail page.
        </div>
      </div>
      <div className="live-widget-body">
        <div className="live-widget-top">
          <div className="min-w-0">
            <Identity name={runTranscriptFixtureMeta.agentName} size="sm" />
            <div className="live-widget-id-wrap">
              <span className="live-widget-run-id">
                {runTranscriptFixtureMeta.sourceRunId.slice(0, 8)}
              </span>
              <StatusBadge status={streaming ? "running" : "succeeded"} />
              <span>{formatDateTime(runTranscriptFixtureMeta.startedAt)}</span>
            </div>
          </div>
          <span className="live-widget-open-btn">
            Open run
            <ExternalLink className="h-3 w-3" aria-hidden />
          </span>
        </div>
        <div className="live-widget-scroll">
          <RunTranscriptView
            entries={previewEntries("live")}
            mode={mode}
            density={density}
            limit={density === "compact" ? 10 : 12}
            streaming={streaming}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardPreview({
  streaming,
  mode,
  density,
}: {
  streaming: boolean;
  mode: TranscriptMode;
  density: TranscriptDensity;
}) {
  return (
    <div className="dashboard-preview">
      <div className={`dashboard-preview-card${streaming ? " streaming" : ""}`}>
        <div className="dashboard-preview-header">
          <div className="dashboard-preview-header-top">
            <div className="min-w-0">
              <div className="dashboard-preview-identity-row">
                <span className={`dashboard-preview-dot${streaming ? " streaming" : ""}`} />
                <Identity name={runTranscriptFixtureMeta.agentName} size="sm" />
              </div>
              <div className="dashboard-preview-meta">
                {streaming ? "Live now" : "Finished 2m ago"}
              </div>
            </div>
            <span className="live-widget-open-btn">
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
            </span>
          </div>
          <div className="dashboard-preview-issue-ref">
            {runTranscriptFixtureMeta.issueIdentifier} - {runTranscriptFixtureMeta.issueTitle}
          </div>
        </div>
        <div className="dashboard-preview-body">
          <RunTranscriptView
            entries={previewEntries("dashboard")}
            mode={mode}
            density={density}
            limit={density === "compact" ? 6 : 8}
            streaming={streaming}
          />
        </div>
      </div>
    </div>
  );
}

export function RunTranscriptUxLab() {
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId>("detail");
  const [detailMode, setDetailMode] = useState<TranscriptMode>("nice");
  const [streaming, setStreaming] = useState(true);
  const [density, setDensity] = useState<TranscriptDensity>("comfortable");

  const selected = surfaceOptions.find((option) => option.id === selectedSurface) ?? surfaceOptions[0];

  return (
    <div className="ux-lab-root">
      <div className="ux-lab-hero">
        <div className="ux-lab-grid">
          <aside className="ux-lab-aside">
            <div className="ux-lab-aside-intro">
              <div className="ux-lab-badge">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                UX Lab
              </div>
              <h1 className="ux-lab-title">Run Transcript Fixtures</h1>
              <p className="ux-lab-desc">
                Built from a real VFactory development run, then sanitized so no secrets, local paths, or environment details survive into the fixture.
              </p>
            </div>

            <div className="ux-lab-surface-list">
              {surfaceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedSurface(option.id)}
                    className={`ux-lab-surface-btn${selectedSurface === option.id ? " active" : ""}`}
                  >
                    <div className="ux-lab-surface-btn-inner">
                      <span className="ux-lab-surface-icon-wrap">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="ux-lab-surface-eyebrow">
                          {option.eyebrow}
                        </span>
                        <span className="ux-lab-surface-label">{option.label}</span>
                        <span className="ux-lab-surface-desc">
                          {option.description}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="ux-lab-main">
            <div className="ux-lab-main-header">
              <div>
                <div className="ux-lab-main-eyebrow">
                  {selected.eyebrow}
                </div>
                <h2 className="ux-lab-main-title">{selected.label}</h2>
                <p className="ux-lab-main-desc">
                  {selected.description}
                </p>
              </div>

              <div className="ux-lab-badges">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                  Source run {runTranscriptFixtureMeta.sourceRunId.slice(0, 8)}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em]">
                  {runTranscriptFixtureMeta.issueIdentifier}
                </Badge>
              </div>
            </div>

            <div className="ux-lab-controls">
              <span className="ux-lab-controls-label">
                Controls
              </span>
              <div className="ux-lab-pill-group">
                {(["nice", "raw"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`ux-lab-pill${detailMode === mode ? " active" : ""}`}
                    onClick={() => setDetailMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="ux-lab-pill-group">
                {(["comfortable", "compact"] as const).map((nextDensity) => (
                  <button
                    key={nextDensity}
                    type="button"
                    className={`ux-lab-pill${density === nextDensity ? " active" : ""}`}
                    onClick={() => setDensity(nextDensity)}
                  >
                    {nextDensity}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setStreaming((value) => !value)}
              >
                {streaming ? "Show settled state" : "Show streaming state"}
              </Button>
            </div>

            {selectedSurface === "detail" ? (
              <div className={density === "compact" ? "ux-lab-detail-wrap compact" : "ux-lab-detail-wrap"}>
                <RunDetailPreview mode={detailMode} streaming={streaming} density={density} />
              </div>
            ) : selectedSurface === "live" ? (
              <div className={density === "compact" ? "ux-lab-live-wrap compact" : "ux-lab-live-wrap"}>
                <LiveWidgetPreview streaming={streaming} mode={detailMode} density={density} />
              </div>
            ) : (
              <DashboardPreview streaming={streaming} mode={detailMode} density={density} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
