import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TrainTrackerMap } from "../components/TrainTrackerMap";
import "../styles/trackTrain.css";

function parseYyyyMmDdToLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dt = new Date(y, mo - 1, d);
  if (!Number.isFinite(dt.getTime())) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function TrackTrain() {
  const [searchParams] = useSearchParams();
  const initialTrainIdFromUrl = searchParams.get("trainId");
  const travelDateStr = searchParams.get("travelDate") || searchParams.get("date");

  const isTravelDateFuture = (() => {
    const travelDate = parseYyyyMmDdToLocalDate(travelDateStr);
    if (!travelDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return travelDate.getTime() > today.getTime();
  })();

  const [trains, setTrains] = useState([]);
  const [selectedId, setSelectedId] = useState(
    initialTrainIdFromUrl ? Number(initialTrainIdFromUrl) : null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrains = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/trains");
        const data = await res.json();
        setTrains(data);

        // Decide which train to select
        if (initialTrainIdFromUrl) {
          const id = Number(initialTrainIdFromUrl);
          const exists = data.some((t) => t.train_id === id);
          setSelectedId(exists ? id : data[0]?.train_id ?? null);
        } else if (data.length > 0 && selectedId == null) {
          setSelectedId(data[0].train_id);
        }
      } catch (err) {
        console.error("Failed to load trains:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rs-page track-container">
      <div className="track-page-header">
        <h1 className="track-page-title">🚆 Live Train Tracker</h1>
        <p className="track-page-subtitle">Track your train in real-time with RailSmart</p>
      </div>

      <div className="rs-card track-card">
        <h2 className="rs-card-title">Track Your Train</h2>
        <p className="rs-card-subtitle">
          Select a train to view its live location on the map. Location updates
          every 2 seconds.
        </p>

        {loading ? (
          <p className="rs-helper-text" style={{ marginTop: "1rem" }}>
            Loading trains...
          </p>
        ) : trains.length === 0 ? (
          <p className="rs-helper-text" style={{ marginTop: "1rem" }}>
            No trains available
          </p>
        ) : (
          <>
            <div className="track-select-wrap">
              <label className="track-select-label">
                Select Train
              </label>
              <select
                className="rs-input track-select"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{ width: "100%" }}
              >
                {trains.map((t) => (
                  <option key={t.train_id} value={t.train_id}>
                    {t.train_name} ({t.source} → {t.destination})
                  </option>
                ))}
              </select>
            </div>

            {selectedId && (
              <div>
                <h3 className="track-section-title">
                  📍 Tracking:{" "}
                  {trains.find((t) => t.train_id === selectedId)?.train_name}
                </h3>
                {isTravelDateFuture ? (
                  <div className="track-info-note">
                    Live tracking is available only on the journey day.
                  </div>
                ) : (
                  <>
                    <div className="map-wrapper">
                      <TrainTrackerMap trainId={selectedId} />
                    </div>
                    <div className="map-legend">
                      <div className="legend-item">
                        <span className="legend-line legend-track" />
                        Railway Track (Simulated)
                      </div>
                      <div className="legend-item">
                        <span className="legend-line legend-train" />
                        Train Route
                      </div>
                    </div>
                    <p className="rs-helper-text" style={{ marginTop: "1rem", fontStyle: "italic" }}>
                      💡 Tip: Add <strong>travelDate=YYYY-MM-DD</strong> in the URL
                      query to enforce journey-day gating.
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TrackTrain;
