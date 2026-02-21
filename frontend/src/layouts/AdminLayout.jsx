import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Activity, ArrowLeft, BarChart3, LayoutDashboard, ShieldCheck } from "lucide-react";
import "../styles/adminLayout.css";

export default function AdminLayout() {
  const navigate = useNavigate();

  let adminLabel = "Admin user";
  try {
    const raw = localStorage.getItem("user");
    const parsed = raw ? JSON.parse(raw) : null;
    adminLabel = parsed?.name || parsed?.email || adminLabel;
  } catch {
    adminLabel = "Admin user";
  }

  return (
    <div className="admin-layout">
      <aside className="admin-layout-sidebar">
        <div className="admin-layout-head">
          <h2 className="admin-layout-title">RailSmart Admin</h2>
          <p className="admin-layout-subtitle">Logged in as: {adminLabel}</p>
        </div>

        <NavLink
          to="/admin"
          end
          className={({ isActive }) => `admin-layout-link ${isActive ? "active" : ""}`}
        >
          <LayoutDashboard size={18} />
          <span>Overview</span>
        </NavLink>

        <NavLink
          to="/admin/analytics"
          end
          className={({ isActive }) => `admin-layout-link ${isActive ? "active" : ""}`}
        >
          <BarChart3 size={18} />
          <span>Analytics</span>
        </NavLink>

        <NavLink
          to="/admin/audit"
          end
          className={({ isActive }) => `admin-layout-link ${isActive ? "active" : ""}`}
        >
          <ShieldCheck size={18} />
          <span>Audit Logs</span>
        </NavLink>

        <NavLink
          to="/admin/monitoring"
          end
          className={({ isActive }) => `admin-layout-link ${isActive ? "active" : ""}`}
        >
          <Activity size={18} />
          <span>Monitoring</span>
        </NavLink>

        <div className="admin-layout-divider" />

        <button
          type="button"
          className="admin-layout-exit"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={16} />
          <span>Back to User App</span>
        </button>
      </aside>

      <main className="admin-layout-content">
        <Outlet />
      </main>
    </div>
  );
}
