import Skeleton from "../ui/Skeleton";
import "../../styles/userDashboard.css";

export default function DashboardSkeleton() {
  return (
    <div className="rs-page user-dashboard-page" aria-hidden="true">
      <div className="user-dashboard-hero">
        <Skeleton className="user-dashboard-skeleton-title" />
        <Skeleton className="user-dashboard-skeleton-subtitle" />
      </div>

      <div className="user-dashboard-kpi-grid">
        <div className="skeleton-card">
          <Skeleton className="user-dashboard-skeleton-kpi-title" />
          <Skeleton className="user-dashboard-skeleton-kpi-value" />
          <Skeleton className="user-dashboard-skeleton-kpi-trend" />
        </div>
        <div className="skeleton-card">
          <Skeleton className="user-dashboard-skeleton-kpi-title" />
          <Skeleton className="user-dashboard-skeleton-kpi-value" />
          <Skeleton className="user-dashboard-skeleton-kpi-trend" />
        </div>
        <div className="skeleton-card">
          <Skeleton className="user-dashboard-skeleton-kpi-title" />
          <Skeleton className="user-dashboard-skeleton-kpi-value" />
          <Skeleton className="user-dashboard-skeleton-kpi-trend" />
        </div>
      </div>

      <section className="user-dashboard-panel">
        <Skeleton className="user-dashboard-skeleton-panel-title" />
        <Skeleton className="user-dashboard-skeleton-chart" />
      </section>

      <section className="user-dashboard-panel">
        <Skeleton className="user-dashboard-skeleton-panel-title" />
        <Skeleton className="user-dashboard-skeleton-occupancy" />
      </section>

      <section className="user-dashboard-panel">
        <Skeleton className="user-dashboard-skeleton-panel-title" />
        <Skeleton className="user-dashboard-skeleton-table" />
      </section>
    </div>
  );
}
