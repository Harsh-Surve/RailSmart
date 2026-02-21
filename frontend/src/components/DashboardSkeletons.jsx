import React from "react";
import Skeleton from "./Skeleton";

export function KpiSkeletonGrid({ cards = 3 }) {
  return (
    <div className="user-dashboard-kpi-grid" aria-hidden="true">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="skeleton-card">
          <Skeleton height={12} width="42%" />
          <Skeleton height={28} width="70%" />
          <Skeleton height={14} width="56%" />
        </div>
      ))}
    </div>
  );
}

export function ChartPanelSkeleton({ titleWidth = "36%", height = 320 }) {
  return (
    <section className="user-dashboard-panel" aria-hidden="true">
      <Skeleton height={16} width={titleWidth} />
      <div style={{ marginTop: "0.9rem" }}>
        <Skeleton height={height} width="100%" />
      </div>
    </section>
  );
}

export function OccupancyPanelSkeleton({ rows = 4 }) {
  return (
    <section className="user-dashboard-panel" aria-hidden="true">
      <Skeleton height={16} width="40%" />
      <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="skeleton-card" style={{ padding: "0.75rem" }}>
            <div className="skeleton-row">
              <Skeleton height={14} width="42%" />
              <Skeleton height={14} width="16%" />
            </div>
            <Skeleton height={8} width="100%" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TablePanelSkeleton({ columns = 5, rows = 5 }) {
  return (
    <section className="user-dashboard-panel" aria-hidden="true">
      <Skeleton height={16} width="32%" />
      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.55rem" }}>
        <div className="skeleton-row" style={{ gap: "0.6rem" }}>
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={`h-${index}`} height={12} width="18%" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`r-${rowIndex}`} className="skeleton-row" style={{ gap: "0.6rem" }}>
            {Array.from({ length: columns }).map((_, columnIndex) => (
              <Skeleton key={`c-${rowIndex}-${columnIndex}`} height={14} width="18%" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
