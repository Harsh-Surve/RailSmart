import { useEffect, useMemo, useState } from "react";
import "../../styles/adminAuditLogs.css";

const API_BASE_URL = "http://localhost:5000";

function toLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function normalizeDetails(details) {
  if (!details || typeof details !== "object") {
    return "{}";
  }
  return JSON.stringify(details, null, 2);
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [draftAction, setDraftAction] = useState("");
  const [draftUser, setDraftUser] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftDateFrom, setDraftDateFrom] = useState("");
  const [draftDateTo, setDraftDateTo] = useState("");

  const hasData = logs.length > 0;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });

      if (action) params.set("action", action);
      if (user) params.set("user", user);
      if (search) params.set("q", search);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`, {
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch audit logs");
      }

      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setPagination(
        data?.pagination || {
          page,
          limit,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (err) {
      setError(err?.message || "Failed to fetch audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, action, user, search, dateFrom, dateTo]);

  const appliedFilterCount = useMemo(() => {
    return [action, user, search, dateFrom, dateTo].filter((value) => String(value || "").trim()).length;
  }, [action, user, search, dateFrom, dateTo]);

  const handleApplyFilters = () => {
    setPage(1);
    setAction(draftAction.trim());
    setUser(draftUser.trim());
    setSearch(draftSearch.trim());
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
  };

  const handleResetFilters = () => {
    setDraftAction("");
    setDraftUser("");
    setDraftSearch("");
    setDraftDateFrom("");
    setDraftDateTo("");
    setPage(1);
    setAction("");
    setUser("");
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  const handleExportCsv = () => {
    const headers = ["id", "email", "action", "details", "created_at"];
    const rows = logs.map((log) => [
      log.id,
      log.email,
      log.action,
      JSON.stringify(log.details || {}),
      log.created_at,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    link.href = url;
    link.setAttribute("download", `audit-logs-page-${pagination.page}-${stamp}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-audit-page">
      <div className="admin-audit-header">
        <div>
          <h2 className="admin-audit-title">Audit Logs</h2>
          <p className="admin-audit-subtitle">Trace and review privileged admin actions across the system.</p>
        </div>
        <div className="admin-audit-header-meta">
          <span className="admin-audit-meta-pill">Total: {pagination.total}</span>
          <span className="admin-audit-meta-pill">Filters: {appliedFilterCount}</span>
        </div>
      </div>

      <div className="admin-audit-filters">
        <input
          placeholder="User email"
          value={draftUser}
          onChange={(event) => setDraftUser(event.target.value)}
          className="admin-audit-input"
        />
        <input
          placeholder="Action (e.g. ADMIN_CANCEL_TICKET)"
          value={draftAction}
          onChange={(event) => setDraftAction(event.target.value)}
          className="admin-audit-input"
        />
        <input
          placeholder="Search email/action/details"
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          className="admin-audit-input"
        />
        <input
          type="date"
          value={draftDateFrom}
          onChange={(event) => setDraftDateFrom(event.target.value)}
          className="admin-audit-input"
          title="From date"
        />
        <input
          type="date"
          value={draftDateTo}
          onChange={(event) => setDraftDateTo(event.target.value)}
          className="admin-audit-input"
          title="To date"
        />

        <button type="button" onClick={handleApplyFilters} className="admin-audit-btn admin-audit-btn-primary">
          Apply
        </button>
        <button type="button" onClick={handleResetFilters} className="admin-audit-btn">
          Reset
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          className="admin-audit-btn"
          disabled={!hasData}
          title="Export currently visible rows"
        >
          Export CSV
        </button>
      </div>

      {error && <p className="rs-error-text">{error}</p>}

      <div className="table-wrapper admin-audit-table-wrap">
        <table className="table admin-audit-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Action</th>
              <th>Details</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="rs-helper-text">Loading audit logs...</td>
              </tr>
            ) : null}

            {!loading && !hasData ? (
              <tr>
                <td colSpan={5} className="rs-helper-text">No audit logs found for current filters.</td>
              </tr>
            ) : null}

            {!loading &&
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.email}</td>
                  <td>
                    <span className="admin-audit-action">{log.action}</span>
                  </td>
                  <td>
                    <details>
                      <summary className="admin-audit-details-summary">View details</summary>
                      <pre className="admin-audit-details-pre">{normalizeDetails(log.details)}</pre>
                    </details>
                  </td>
                  <td>{toLocalDateTime(log.created_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="admin-audit-pagination">
        <div className="admin-audit-pagination-meta">
          Page {pagination.page} of {pagination.totalPages} • {pagination.total} records
        </div>
        <div className="admin-audit-pagination-actions">
          <label className="admin-audit-limit-label">
            Rows:
            <select
              value={limit}
              onChange={(event) => {
                setPage(1);
                setLimit(Number(event.target.value));
              }}
              className="admin-audit-select"
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={pagination.page <= 1 || loading}
            className="admin-audit-btn"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="admin-audit-btn"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}