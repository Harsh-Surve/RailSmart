import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TrainTrackerMap } from "../components/TrainTrackerMap";

function TrackTrain() {
  const [searchParams] = useSearchParams();
  const initialTrainIdFromUrl = searchParams.get("trainId");

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
    <div className="rs-page">
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className="rs-page-title" style={{ margin: 0, fontSize: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          🚆 Live Train Tracker
        </h1>
        <p style={{ fontSize: "0.75rem", color: "var(--rs-text-muted)", margin: 0 }}>
          Track your train in real-time with RailSmart
        </p>
      </div>

      <div className="rs-card" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h2 className="rs-card-title">Track Your Train</h2>
        <p className="rs-card-subtitle">
          Select a train to view its live location on the map. Location is
          simulated based on departure and arrival time.
        </p>

        {loading ? (
          <p style={{ fontSize: "0.9rem", color: "var(--rs-text-muted)", marginTop: "1rem" }}>
            Loading trains...
          </p>
        ) : trains.length === 0 ? (
          <p style={{ fontSize: "0.9rem", color: "var(--rs-text-muted)", marginTop: "1rem" }}>
            No trains available
          </p>
        ) : (
          <>
            <div style={{ marginBottom: "1.5rem", marginTop: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "0.5rem",
                  fontWeight: 500,
                  color: "var(--rs-text-main)",
                }}
              >
                Select Train
              </label>
              <select
                className="rs-input"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                style={{
                  width: "100%",
                  maxWidth: "500px",
                  cursor: "pointer",
                }}
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
                <h3
                  style={{
                    fontSize: "1rem",
                    marginBottom: "1rem",
                    color: "var(--rs-text-main)",
                    fontWeight: 600,
                  }}
                >
                  📍 Tracking:{" "}
                  {trains.find((t) => t.train_id === selectedId)?.train_name}
                </h3>
                <TrainTrackerMap trainId={selectedId} />
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--rs-text-muted)",
                    marginTop: "1rem",
                    fontStyle: "italic",
                  }}
                >
                  💡 The train location is simulated by interpolating between
                  source and destination coordinates based on current time
                  relative to departure and arrival schedule.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TrackTrain;
