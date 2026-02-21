import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import "../../styles/adminMonitoring.css";

const API_BASE_URL = "http://localhost:5000";

function formatBytesToMB(bytes) {
  return Number((Number(bytes || 0) / (1024 * 1024)).toFixed(2));
}

function formatUptime(seconds) {
  const totalSeconds = Number(seconds || 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

export default function AdminMonitoring() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMonitoringData = async () => {
    try {
      const [healthRes, metricsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/health`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/api/metrics`, { credentials: "include" }),
      ]);

      const healthData = await healthRes.json().catch(() => ({}));
      const metricsData = await metricsRes.json().catch(() => ({}));

      if (!healthRes.ok || !metricsRes.ok) {
        throw new Error(healthData?.message || metricsData?.message || "Failed to fetch monitoring data");
      }

      setHealth(healthData);
      setMetrics(metricsData);

      const point = {
        time: new Date().toLocaleTimeString("en-IN", { hour12: false }),
        heapUsedMB: formatBytesToMB(metricsData?.memory?.heapUsed),
        rssMB: formatBytesToMB(metricsData?.memory?.rss),
        requestAvgMs: Number(metricsData?.requestMetrics?.avgDurationMs || 0),
        requestMaxMs: Number(metricsData?.requestMetrics?.maxDurationMs || 0),
      };

      setSeries((previous) => [...previous.slice(-29), point]);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to fetch monitoring data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
    const interval = setInterval(fetchMonitoringData, 5000);
    return () => clearInterval(interval);
  }, []);

  const uptimeLabel = useMemo(() => formatUptime(metrics?.uptime || health?.uptimeSeconds), [metrics, health]);
  const heapUsedMB = useMemo(() => formatBytesToMB(metrics?.memory?.heapUsed), [metrics]);
  const heapTotalMB = useMemo(() => formatBytesToMB(metrics?.memory?.heapTotal), [metrics]);
  const rssMB = useMemo(() => formatBytesToMB(metrics?.memory?.rss), [metrics]);
  const cpuUserMs = useMemo(() => Number((Number(metrics?.cpu?.user || 0) / 1000).toFixed(2)), [metrics]);
  const cpuSystemMs = useMemo(() => Number((Number(metrics?.cpu?.system || 0) / 1000).toFixed(2)), [metrics]);

  return (
    <section className="monitor-page">
      <div className="monitor-header">
        <div>
          <h2 className="monitor-title">System Monitoring</h2>
          <p className="monitor-subtitle">Live server and performance telemetry (auto-refresh every 5 seconds).</p>
        </div>
        <span className={`monitor-status ${health?.status === "OK" ? "ok" : "warn"}`}>
          {health?.status || "UNKNOWN"}
        </span>
      </div>

      {error ? <p className="rs-error-text">{error}</p> : null}

      <div className="monitor-grid">
        <article className="monitor-card">
          <p className="monitor-label">Uptime</p>
          <h3 className="monitor-value">{uptimeLabel}</h3>
        </article>

        <article className="monitor-card">
          <p className="monitor-label">Memory Heap</p>
          <h3 className="monitor-value">{heapUsedMB} MB</h3>
          <p className="monitor-note">of {heapTotalMB} MB total heap</p>
        </article>

        <article className="monitor-card">
          <p className="monitor-label">RSS Memory</p>
          <h3 className="monitor-value">{rssMB} MB</h3>
        </article>

        <article className="monitor-card">
          <p className="monitor-label">CPU Usage</p>
          <h3 className="monitor-value">{cpuUserMs}ms</h3>
          <p className="monitor-note">system {cpuSystemMs}ms</p>
        </article>

        <article className="monitor-card">
          <p className="monitor-label">Req Avg Duration</p>
          <h3 className="monitor-value">{Number(metrics?.requestMetrics?.avgDurationMs || 0)} ms</h3>
          <p className="monitor-note">max {Number(metrics?.requestMetrics?.maxDurationMs || 0)} ms</p>
        </article>

        <article className="monitor-card">
          <p className="monitor-label">Total Requests</p>
          <h3 className="monitor-value">{Number(metrics?.requestMetrics?.totalRequests || 0)}</h3>
          <p className="monitor-note">
            2xx {Number(metrics?.requestMetrics?.statusCodeBuckets?.["2xx"] || 0)} · 4xx {Number(metrics?.requestMetrics?.statusCodeBuckets?.["4xx"] || 0)} · 5xx {Number(metrics?.requestMetrics?.statusCodeBuckets?.["5xx"] || 0)}
          </p>
        </article>
      </div>

      <div className="monitor-chart-grid">
        <section className="monitor-panel">
          <p className="monitor-panel-title">Memory Usage (MB)</p>
          <div className="monitor-chart-wrap">
            {loading ? (
              <p className="rs-helper-text">Loading metrics...</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--rs-border)" />
                  <XAxis dataKey="time" minTickGap={20} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="heapUsedMB" name="Heap Used" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="rssMB" name="RSS" stroke="#06b6d4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="monitor-panel">
          <p className="monitor-panel-title">Request Timing (ms)</p>
          <div className="monitor-chart-wrap">
            {loading ? (
              <p className="rs-helper-text">Loading metrics...</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--rs-border)" />
                  <XAxis dataKey="time" minTickGap={20} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="requestAvgMs" name="Avg Duration" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="requestMaxMs" name="Max Duration" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}