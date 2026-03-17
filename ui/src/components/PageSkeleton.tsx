import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  variant?:
    | "list"
    | "issues-list"
    | "detail"
    | "dashboard"
    | "approvals"
    | "costs"
    | "inbox"
    | "org-chart";
}

export function PageSkeleton({ variant = "list" }: PageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="dashboard-skeleton-page">
        <Skeleton className="dashboard-skeleton-banner" />

        <div className="dashboard-skeleton-metrics">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="dashboard-skeleton-metric" />
          ))}
        </div>

        <div className="dashboard-skeleton-charts">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="dashboard-skeleton-chart" />
          ))}
        </div>

        <div className="dashboard-skeleton-two-col">
          <Skeleton className="dashboard-skeleton-block" />
          <Skeleton className="dashboard-skeleton-block" />
        </div>
      </div>
    );
  }

  if (variant === "approvals") {
    return (
      <div className="approvals-skeleton">
        <div className="approvals-skeleton-header">
          <Skeleton className="approvals-skeleton-tab" />
        </div>
        <div className="approvals-skeleton-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="approvals-skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "costs") {
    return (
      <div className="costs-skeleton">
        <div className="costs-skeleton-filters">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="costs-skeleton-filter" />
          ))}
        </div>

        <Skeleton className="costs-skeleton-chart" />

        <div className="costs-skeleton-grid">
          <Skeleton className="costs-skeleton-panel" />
          <Skeleton className="costs-skeleton-panel" />
        </div>
      </div>
    );
  }

  if (variant === "inbox") {
    return (
      <div className="inbox-skeleton">
        <div className="inbox-skeleton-header">
          <Skeleton className="inbox-skeleton-tab" />
          <Skeleton className="inbox-skeleton-filter" />
        </div>

        <div className="inbox-skeleton-body">
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="inbox-skeleton-section">
              <Skeleton className="inbox-skeleton-section-title" />
              <div className="inbox-skeleton-section-rows">
                {Array.from({ length: 3 }).map((_, row) => (
                  <Skeleton key={row} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "org-chart") {
    return (
      <div className="org-chart-skeleton">
        <Skeleton className="org-chart-skeleton-map" />
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="detail-skeleton">
        <div className="detail-skeleton-block">
          <Skeleton className="detail-skeleton-line" />
          <div className="detail-skeleton-meta">
            <Skeleton className="detail-skeleton-meta-icon" />
            <Skeleton className="detail-skeleton-meta-icon" />
            <Skeleton className="detail-skeleton-meta-title" />
          </div>
          <Skeleton className="detail-skeleton-label" />
        </div>

        <div className="detail-skeleton-block">
          <Skeleton className="detail-skeleton-card" />
          <Skeleton className="detail-skeleton-card _h-32" />
        </div>

        <div className="detail-skeleton-block">
          <div className="detail-skeleton-card-row">
            <Skeleton className="detail-skeleton-card" />
            <Skeleton className="detail-skeleton-card" />
            <Skeleton className="detail-skeleton-card" />
          </div>
          <Skeleton className="detail-skeleton-card-block" />
          <Skeleton className="detail-skeleton-card-block" />
        </div>
      </div>
    );
  }

  if (variant === "issues-list") {
    return (
      <div className="issues-list-skeleton">
        <div className="issues-list-skeleton-header">
          <Skeleton className="issues-list-skeleton-title" />
          <div className="issues-list-skeleton-actions">
            <Skeleton className="issues-list-skeleton-action" />
            <Skeleton className="issues-list-skeleton-action" />
            <Skeleton className="issues-list-skeleton-action" />
            <Skeleton className="issues-list-skeleton-action _w-24" />
          </div>
        </div>

        <div className="detail-skeleton-block">
          <Skeleton className="issues-list-skeleton-filter" />
          <div className="issues-list-skeleton-rows">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="issues-list-skeleton-row" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="list-skeleton">
      <div className="list-skeleton-header">
        <Skeleton className="list-skeleton-header-title" />
        <div className="list-skeleton-actions">
          <Skeleton className="list-skeleton-action _w-20" />
          <Skeleton className="list-skeleton-action _w-24" />
        </div>
      </div>

      <div className="list-skeleton-rows">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="list-skeleton-row" />
        ))}
      </div>
    </div>
  );
}
