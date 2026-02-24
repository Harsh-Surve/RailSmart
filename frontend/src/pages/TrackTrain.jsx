import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { TrainTrackerMap } from "../components/TrainTrackerMap";
import Skeleton from "../components/Skeleton";
import { Train, MapPin, Ban, CheckCircle } from "lucide-react";
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

function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TrackTrain() {
  const [searchParams] = useSearchParams();
  const initialTrainIdFromUrl = searchParams.get("trainId");
  const travelDateStr = searchParams.get("travelDate") || searchParams.get("date");

  const [trackingDate, setTrackingDate] = useState(travelDateStr || getLocalDateStr());

  // ✅ SYNC trackingDate when URL params change (e.g., clicking Track Train from My Tickets)
  useEffect(() => {
    if (travelDateStr) {
      setTrackingDate(travelDateStr);
    }
  }, [travelDateStr]);

  const trackingMode = (() => {
    const travelDate = parseYyyyMmDdToLocalDate(trackingDate);
    if (!travelDate) return "live";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (travelDate.getTime() < today.getTime()) return "completed";
    if (travelDate.getTime() > today.getTime()) return "scheduled";
    return "live";
  })();

  const [trains, setTrains] = useState([]);
  const [trainSearch, setTrainSearch] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialTrainIdFromUrl ? Number(initialTrainIdFromUrl) : null
  );
  const [loading, setLoading] = useState(true);
  
  // ✅ SYNC selectedId when URL params change
  useEffect(() => {
    if (initialTrainIdFromUrl) {
      setSelectedId(Number(initialTrainIdFromUrl));
    }
  }, [initialTrainIdFromUrl]);

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

  const sortedTrains = useMemo(() => {
    return [...trains].sort((left, right) => {
      const sourceCompare = String(left.source || "").localeCompare(String(right.source || ""));
      if (sourceCompare !== 0) return sourceCompare;

      const destinationCompare = String(left.destination || "").localeCompare(String(right.destination || ""));
      if (destinationCompare !== 0) return destinationCompare;

      return String(left.train_name || "").localeCompare(String(right.train_name || ""));
    });
  }, [trains]);

  const filteredTrains = useMemo(() => {
    const query = trainSearch.trim().toLowerCase();
    if (!query) return sortedTrains;

    return sortedTrains.filter((train) => {
      const label = `${train.train_name || ""} ${train.source || ""} ${train.destination || ""}`.toLowerCase();
      return label.includes(query);
    });
  }, [sortedTrains, trainSearch]);

  useEffect(() => {
    if (!filteredTrains.length) return;
    if (selectedId == null) return;

    const stillVisible = filteredTrains.some((train) => train.train_id === selectedId);
    if (!stillVisible) {
      setSelectedId(filteredTrains[0].train_id);
    }
  }, [filteredTrains, selectedId]);

  return (
    <div className="rs-page track-container">
      <div className="track-page-header">
        <h1 className="track-page-title"><Train size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Live Train Tracker</h1>
        <p className="track-page-subtitle">Track your train in real-time with RailSmart</p>
      </div>

      <div className="rs-card track-card">
        <h2 className="rs-card-title">Track Your Train</h2>
        <p className="rs-card-subtitle">
          Select a train to view its live location on the map. Location updates
          every 5 seconds.
        </p>

        {loading ? (
          <div style={{ marginTop: "1rem" }}>
            <Skeleton height={20} width="40%" />
            <div style={{ marginTop: "0.75rem" }}>
              <Skeleton height={44} />
            </div>
            <div style={{ marginTop: "1.5rem" }}>
              <Skeleton height={300} />
            </div>
          </div>
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
              <input
                type="text"
                className="rs-input track-search-input"
                value={trainSearch}
                onChange={(e) => setTrainSearch(e.target.value)}
                placeholder="Search train, source, destination..."
                style={{ width: "100%" }}
              />
              <select
                className="rs-input track-select"
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                size={Math.min(8, Math.max(filteredTrains.length, 1))}
                style={{ width: "100%" }}
              >
                {filteredTrains.map((t) => (
                  <option key={t.train_id} value={t.train_id}>
                    {t.train_name} ({t.source} → {t.destination})
                  </option>
                ))}
              </select>
              {filteredTrains.length === 0 && (
                <p className="rs-helper-text" style={{ marginTop: "0.5rem" }}>
                  No trains match your search.
                </p>
              )}
            </div>

            {/* Journey Date Picker - for date-aware tracking */}
            <div className="track-select-wrap" style={{ marginTop: "1rem" }}>
              <label className="track-select-label">
                Journey Date
              </label>
              <input
                type="date"
                className="rs-input"
                value={trackingDate}
                onChange={(e) => setTrackingDate(e.target.value)}
                style={{ width: "100%" }}
              />
              <p className="rs-helper-text" style={{ marginTop: "0.25rem", fontSize: "0.75rem" }}>
                Select the date of the journey you want to track
              </p>
            </div>

            {selectedId && (
              <div>
                <h3 className="track-section-title">
                  <MapPin size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Tracking:{" "}
                  {trains.find((t) => t.train_id === selectedId)?.train_name}
                  {trackingDate && (
                    <span style={{ fontWeight: "normal", fontSize: "0.9rem", marginLeft: "0.5rem", color: "#6b7280" }}>
                      ({new Date(trackingDate).toLocaleDateString("en-GB")})
                    </span>
                  )}
                </h3>
                {trackingMode === "scheduled" ? (
                  <div className="track-info-note">
                    <Ban size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Live tracking is available only on the journey day. Please select today's date or wait for the journey date.
                  </div>
                ) : trackingMode === "completed" ? (
                  <div className="track-info-note">
                    <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Journey completed for this date. Historical summary mode is shown; live movement is disabled.
                  </div>
                ) : (
                  <>
                    <div className="map-wrapper">
                      <TrainTrackerMap trainId={selectedId} trackingDate={trackingDate} />
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
