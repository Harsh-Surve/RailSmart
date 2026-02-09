import React from "react";
import "./Skeleton.css";

/**
 * Reusable skeleton placeholder for loading states.
 *
 * Variants:
 *  - "card"   → summary card placeholder (used in dashboard)
 *  - "ticket" → ticket card placeholder (used in My Tickets)
 *  - "text"   → single line of text
 *  - "chart"  → chart area placeholder
 *
 * @param {{ variant?: string, count?: number }} props
 */
export default function Skeleton({ variant = "card", count = 1 }) {
  const items = Array.from({ length: count });

  if (variant === "card") {
    return (
      <div className="skeleton-grid">
        {items.map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-line skeleton-line--short" />
            <div className="skeleton-line skeleton-line--large" />
            <div className="skeleton-line skeleton-line--medium" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "ticket") {
    return (
      <div className="skeleton-tickets">
        {items.map((_, i) => (
          <div key={i} className="skeleton-ticket">
            <div className="skeleton-ticket-left">
              <div className="skeleton-line skeleton-line--medium" />
              <div className="skeleton-line skeleton-line--long" />
              <div className="skeleton-chips">
                <div className="skeleton-chip" />
                <div className="skeleton-chip" />
                <div className="skeleton-chip" />
              </div>
            </div>
            <div className="skeleton-ticket-right">
              <div className="skeleton-line skeleton-line--short" />
              <div className="skeleton-btn-placeholder" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className="skeleton-chart">
        <div className="skeleton-bar" style={{ height: "60%" }} />
        <div className="skeleton-bar" style={{ height: "80%" }} />
        <div className="skeleton-bar" style={{ height: "45%" }} />
        <div className="skeleton-bar" style={{ height: "90%" }} />
        <div className="skeleton-bar" style={{ height: "55%" }} />
        <div className="skeleton-bar" style={{ height: "70%" }} />
        <div className="skeleton-bar" style={{ height: "35%" }} />
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="skeleton-table">
        {items.map((_, i) => (
          <div key={i} className="skeleton-table-row">
            <div className="skeleton-line skeleton-line--short" />
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--long" />
            <div className="skeleton-line skeleton-line--short" />
          </div>
        ))}
      </div>
    );
  }

  // Default: text lines
  return (
    <div className="skeleton-text">
      {items.map((_, i) => (
        <div key={i} className="skeleton-line skeleton-line--long" />
      ))}
    </div>
  );
}
