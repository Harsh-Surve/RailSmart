import React from "react";

/**
 * Skeleton loader — shows animated shimmer placeholder while data loads.
 * Usage:
 *   <Skeleton height={80} count={3} />           → 3 card-sized bars
 *   <Skeleton height={20} width="60%" />          → short text bar
 *   <Skeleton height={20} width="100%" count={4}/> → 4 full-width bars
 */
export default function Skeleton({ height = 20, width = "100%", count = 1 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width }}
        />
      ))}
    </div>
  );
}
