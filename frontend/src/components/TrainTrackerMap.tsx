import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import * as L from "leaflet";
import trainIconUrl from "../assets/train.png";
import { applyDefaultLeafletIcon } from "../utils/leafletIcon";
import "./TrainTrackerMap.css";

// Ensure Leaflet marker icons load correctly in Vite
applyDefaultLeafletIcon();

const API_BASE = "http://localhost:5000";

type LiveTrackingResponse = {
  trainId?: number;
  trainName?: string;
  trainNumber?: string;
  trainNo?: string;
  status?: string;

  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  lon?: number;

  eta?: string | number | null;
  endTime?: string | number | null;
  arrivalTime?: string | number | null;

  delayMinutes?: number | null;

  source?: string;
  destination?: string;
  sourceLat?: number;
  sourceLng?: number;
  destLat?: number;
  destLng?: number;
};

function parseNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v);
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString();
}

function deriveStatus(raw: string | undefined, delayMinutes: number): "RUNNING" | "DELAYED" | "ARRIVED" {
  const normalized = (raw || "").toUpperCase();
  if (normalized.includes("ARRIVED")) return "ARRIVED";
  if (delayMinutes > 0) return "DELAYED";
  return "RUNNING";
}

function deriveScheduledArrival(end: Date | null, delayMinutes: number): Date | null {
  if (!end) return null;
  if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) return end;
  return new Date(end.getTime() - delayMinutes * 60_000);
}

function MapAutoCenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  const didCenter = useRef(false);

  useEffect(() => {
    if (!center) return;
    if (didCenter.current) return;
    didCenter.current = true;
    map.setView(center, map.getZoom(), { animate: false });
  }, [center, map]);

  return null;
}

export interface TrainTrackerMapProps {
  trainId: number;
  trackingDate?: string; // Optional: YYYY-MM-DD format for journey-date awareness
}

export function TrainTrackerMap({ trainId, trackingDate }: TrainTrackerMapProps) {
  const [data, setData] = useState<LiveTrackingResponse | null>(null);
  const [dataTrainId, setDataTrainId] = useState<number | null>(null); // Track which train the data belongs to
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [trainPos, setTrainPos] = useState<[number, number] | null>(null);
  const [showTracks, setShowTracks] = useState(true);
  const [pollingStopped, setPollingStopped] = useState(false); // Track if polling stopped due to ARRIVED

  const markerRef = useRef<L.Marker | null>(null);
  const lastPosRef = useRef<[number, number] | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const pollTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const trainIdRef = useRef(trainId);
  const trackingDateRef = useRef(trackingDate);

  useEffect(() => {
    trainIdRef.current = trainId;
  }, [trainId]);
  
  useEffect(() => {
    trackingDateRef.current = trackingDate;
  }, [trackingDate]);

  const trainIcon = useMemo(
    () =>
      L.icon({
        iconUrl: trainIconUrl,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18],
      }),
    []
  );

  const animateMarker = useMemo(() => {
    return (from: [number, number], to: [number, number], duration = 1500) => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // If marker isn't mounted yet, fall back to a direct set.
      if (!markerRef.current) {
        setTrainPos(to);
        return;
      }

      const start = performance.now();

      const frame = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const lat = from[0] + (to[0] - from[0]) * progress;
        const lng = from[1] + (to[1] - from[1]) * progress;

        markerRef.current?.setLatLng([lat, lng]);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(frame);
        } else {
          animFrameRef.current = null;
          setTrainPos(to);
        }
      };

      animFrameRef.current = requestAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchLive = async () => {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        if (!data) setLoading(true);
        setErrMsg(null);
        
        // Include journey date in API call for date-aware tracking
        const dateParam = trackingDateRef.current ? `&date=${trackingDateRef.current}` : '';

        const res = await fetch(
          `${API_BASE}/api/trains/${trainIdRef.current}/live-location?demo=1${dateParam}`,
          { headers: { Accept: "application/json" } }
        );

        if (!res.ok) {
          throw new Error(`Live tracking fetch failed (${res.status})`);
        }

        const json: LiveTrackingResponse = await res.json();
        if (cancelled) return;

        const nextDelayMinutes = json?.delayMinutes ? Math.max(0, Number(json.delayMinutes) || 0) : 0;
        const nextStatus = deriveStatus(json?.status, nextDelayMinutes);

        const nextLat = parseNumber(json?.latitude ?? json?.lat);
        const nextLng = parseNumber(json?.longitude ?? json?.lng ?? json?.lon);
        const nextPos: [number, number] | null =
          nextLat != null && nextLng != null ? [nextLat, nextLng] : null;

        // ✅ Store data along with the trainId it belongs to (prevents ghost trains)
        setData(json);
        setDataTrainId(trainIdRef.current);

        // ✅ STOP POLLING ON ARRIVED - No more unnecessary updates
        if (nextStatus === "ARRIVED") {
          if (pollTimer.current) {
            window.clearInterval(pollTimer.current);
            pollTimer.current = null;
          }
          setPollingStopped(true);
        }

        if (nextPos) {
          // Keep the first position as state so React mounts the marker.
          if (!lastPosRef.current) {
            lastPosRef.current = nextPos;
            setTrainPos(nextPos);
            return;
          }

          const from = lastPosRef.current;
          lastPosRef.current = nextPos;

          // Do not animate after arrival.
          if (nextStatus === "ARRIVED") {
            if (animFrameRef.current !== null) {
              cancelAnimationFrame(animFrameRef.current);
              animFrameRef.current = null;
            }
            markerRef.current?.setLatLng(nextPos);
            setTrainPos(nextPos);
            return;
          }

          animateMarker(from, nextPos, 1500);
        }
      } catch (err) {
        console.error("Error fetching live tracking", err);
        if (!cancelled) setErrMsg("Failed to fetch live tracking");
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    // ✅ CLEAR PREVIOUS TRAIN STATE when trainId changes
    // This ensures old train marker/route don't persist on the map
    setData(null);
    setDataTrainId(null);
    setTrainPos(null);
    setLoading(true);
    setErrMsg(null);
    lastPosRef.current = null;
    
    // Reset polling stopped state when trainId or trackingDate changes
    setPollingStopped(false);
    
    fetchLive();
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(fetchLive, 2000);

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }

      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
    // Reset when trainId OR trackingDate changes - both are part of tracking context
  }, [trainId, trackingDate]);

  if (!trainId) {
    return <p className="tracker-error">No train selected.</p>;
  }

  // ✅ CRITICAL: Only use data if it belongs to the CURRENT train
  // This prevents ghost trains from appearing during train switch
  const isDataForCurrentTrain = dataTrainId === trainId;
  const safeData = isDataForCurrentTrain ? data : null;

  const delayMinutes = safeData?.delayMinutes ? Math.max(0, Number(safeData.delayMinutes) || 0) : 0;
  const derivedStatus = deriveStatus(safeData?.status, delayMinutes);

  const lat = parseNumber(safeData?.latitude ?? safeData?.lat);
  const lng = parseNumber(safeData?.longitude ?? safeData?.lng ?? safeData?.lon);
  const polledCenter: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;
  const center: [number, number] | null = trainPos ?? polledCenter;

  const sourceLat = parseNumber(safeData?.sourceLat);
  const sourceLng = parseNumber(safeData?.sourceLng);
  const destLat = parseNumber(safeData?.destLat);
  const destLng = parseNumber(safeData?.destLng);
  const hasRoute = sourceLat != null && sourceLng != null && destLat != null && destLng != null;
  const route: [number, number][] | null = hasRoute
    ? [
        [sourceLat as number, sourceLng as number],
        [destLat as number, destLng as number],
      ]
    : null;

  const mapCenter: [number, number] = center ?? route?.[0] ?? [20.5937, 78.9629];

  const liveEta = parseDate(safeData?.endTime ?? safeData?.eta ?? safeData?.arrivalTime);
  const scheduledArrival = deriveScheduledArrival(liveEta, delayMinutes);
  const trainLabel =
    safeData?.trainName || safeData?.trainNumber || safeData?.trainNo || (trainId ? `Train ${trainId}` : "Train");

  return (
    <div className="tracker-wrap">
      <div className="tracker-bar">
        <div className="tracker-bar-top">
          <div className="tracker-title">{trainLabel} Live Tracking</div>
          <div className="tracker-bar-actions">
            {delayMinutes > 0 ? <div className="tracker-delay">Delay: {delayMinutes} min</div> : null}
            <label className="tracker-toggle">
              <input type="checkbox" checked={showTracks} onChange={() => setShowTracks((s) => !s)} />
              Show Railway Tracks
            </label>
          </div>
        </div>

        <div className="tracker-eta">
          Status: <strong>{derivedStatus}</strong>
          {/* ✅ Clear message when tracking has stopped */}
          {pollingStopped && derivedStatus === "ARRIVED" && (
            <span style={{ marginLeft: "0.5rem", color: "#10b981", fontWeight: "normal" }}>
              • Live tracking stopped
            </span>
          )}
          <br />
          Scheduled Arrival: {formatDateTime(scheduledArrival)}
          <br />
          Live ETA: {formatDateTime(liveEta)}
          {hasRoute ? (
            <>
              <br />
              Route: {safeData?.source || "—"} → {safeData?.destination || "—"}
            </>
          ) : null}
        </div>
      </div>

      {/* ✅ ARRIVED completion message - eliminates all user confusion */}
      {derivedStatus === "ARRIVED" && (
        <div className="tracker-arrived-message" style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          color: "white",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          marginBottom: "0.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontWeight: 500
        }}>
          <span style={{ marginRight: 4 }}>✅</span> Journey completed. Live tracking has stopped.
        </div>
      )}

      {!center ? (
        <div className="tracker-loading">
          {loading ? "Loading live location…" : "Live location unavailable"}
          {errMsg && <div className="tracker-error">{errMsg}</div>}
        </div>
      ) : (
        <div className="tracker-map">
          {/* key={trainId-trackingDate} forces React to unmount/remount map when 
              train OR date changes, clearing all old markers and polylines */}
          <MapContainer 
            key={`${trainId}-${trackingDate || 'default'}`} 
            center={mapCenter} 
            zoom={6} 
            style={{ width: "100%", height: "100%" }}
          >
            <MapAutoCenter center={center} />
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {route ? (
              <>
                {/* OPTION B: Styled simulated railway track (perfectly aligned to route) */}
                {showTracks ? (
                  <>
                    <Polyline
                      positions={route}
                      pathOptions={{ color: "#2f2f2f", weight: 8, opacity: 0.9, lineCap: "round" }}
                    />
                    <Polyline
                      positions={route}
                      pathOptions={{ color: "#c7c7c7", weight: 2, opacity: 0.9, dashArray: "1 12" }}
                    />
                  </>
                ) : null}

                {/* Train route polyline aligned on the track */}
                <Polyline positions={route} pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.9 }} />
              </>
            ) : null}

            {hasRoute ? (
              <>
                <Marker position={[sourceLat as number, sourceLng as number]}>
                  <Popup>
                    <strong>Source:</strong> {safeData?.source || "—"}
                  </Popup>
                </Marker>

                <Marker position={[destLat as number, destLng as number]}>
                  <Popup>
                    <strong>Destination:</strong> {safeData?.destination || "—"}
                  </Popup>
                </Marker>
              </>
            ) : null}

            <Marker position={center} icon={trainIcon} ref={markerRef}>
              <Popup>
                <div>
                  <strong>{trainLabel}</strong>
                  <br />
                  Status: {derivedStatus}
                  <br />
                  Scheduled Arrival: {formatDateTime(scheduledArrival)}
                  <br />
                  Live ETA: {formatDateTime(liveEta)}
                  {delayMinutes > 0 ? (
                    <>
                      <br />
                      Delay: {delayMinutes} min
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      )}
    </div>
  );
}
