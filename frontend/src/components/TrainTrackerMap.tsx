import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { io } from "socket.io-client";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import "./TrainTrackerMap.css";

// Ensure Leaflet marker icons load correctly in Vite
const DefaultIcon = L.icon({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_BASE = "http://localhost:5000";

export type LiveLocation = {
  trainId: number;
  trainName: string;
  source: string;
  destination: string;
  lat: number;
  lon: number;
  speedKmh?: number | null;
  heading?: number | null;
  recordedAt: string;
  startTime?: number | null;
  endTime?: number | null;
  scheduledDurationMs?: number | null;
  delayMinutes?: number | null;
  progress: number;
  status: string;
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
};

function calculateEtaFromProgress(
  startTimeMs: number,
  progressPct: number,
  scheduledDurationMs?: number | null
) {
  const pct = Number.isFinite(progressPct) ? progressPct : 0;

  if (pct <= 0) {
    return { label: "Not started", expectedArrivalMs: null as number | null };
  }
  if (pct >= 100) {
    return { label: "Arrived", expectedArrivalMs: null as number | null };
  }

  const now = Date.now();
  const elapsed = now - startTimeMs;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return { label: "Not started", expectedArrivalMs: null as number | null };
  }

  // Avoid noisy estimates in the first few seconds.
  if (!scheduledDurationMs && elapsed < 15_000) {
    return { label: "Calculating…", expectedArrivalMs: null as number | null };
  }

  const totalDuration = elapsed / (pct / 100);
  const safeScheduled =
    scheduledDurationMs && Number.isFinite(scheduledDurationMs) && scheduledDurationMs > 0
      ? scheduledDurationMs
      : null;

  // If schedule is missing, cap to a sane maximum so the UI never shows multi-day ETAs.
  const hardCapMs = 24 * 60 * 60 * 1000;
  const clampedTotal = safeScheduled ? Math.min(totalDuration, safeScheduled) : Math.min(totalDuration, hardCapMs);
  const remaining = Math.max(0, clampedTotal - elapsed);

  const mins = Math.ceil(remaining / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  const label = hrs > 0 ? `${hrs}h ${remMins}m remaining` : `${remMins}m remaining`;

  return { label, expectedArrivalMs: now + remaining };
}

function computeScheduledDurationMs(data: LiveLocation) {
  if (typeof data.scheduledDurationMs === "number" && data.scheduledDurationMs > 0) {
    return data.scheduledDurationMs;
  }

  if (typeof data.startTime === "number" && typeof data.endTime === "number") {
    let duration = data.endTime - data.startTime;
    if (duration <= 0) duration += 24 * 60 * 60 * 1000;
    if (duration > 0) return duration;
  }

  return null;
}

export interface TrainTrackerMapProps {
  trainId: number;
}

export function TrainTrackerMap({ trainId }: TrainTrackerMapProps) {
  const [data, setData] = useState<LiveLocation | null>(null);
  const [history, setHistory] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "error">("connecting");

  const trainIdRef = useRef<number>(trainId);
  useEffect(() => {
    trainIdRef.current = trainId;
  }, [trainId]);

  // For animated positioning
  const [displayLat, setDisplayLat] = useState<number | null>(null);
  const [displayLng, setDisplayLng] = useState<number | null>(null);
  const displayLatRef = useRef<number | null>(null);
  const displayLngRef = useRef<number | null>(null);
  const animStartLat = useRef(0);
  const animStartLng = useRef(0);
  const animTargetLat = useRef(0);
  const animTargetLng = useRef(0);
  const animStartTime = useRef(0);
  const animFrame = useRef<number | null>(null);
  const ANIM_DURATION = 2000;

  const socket = useMemo(
    () =>
      io(API_BASE, {
        transports: ["websocket", "polling"],
        autoConnect: false,
      }),
    []
  );

  // Connect only while this component is mounted (prevents background auto-connect noise).
  useEffect(() => {
    const onConnect = () => setSocketStatus("connected");
    const onConnectError = (e: unknown) => {
      console.error("Socket connect error", e);
      setSocketStatus("error");
      setErrMsg("Socket connection failed");
    };

    setSocketStatus("connecting");
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
    };
  }, [socket]);

  const startAnimation = (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ) => {
    animStartLat.current = fromLat;
    animStartLng.current = fromLng;
    animTargetLat.current = toLat;
    animTargetLng.current = toLng;
    animStartTime.current = performance.now();

    if (animFrame.current !== null) {
      cancelAnimationFrame(animFrame.current);
    }

    const step = (now: number) => {
      const elapsed = now - animStartTime.current;
      let t = elapsed / ANIM_DURATION;
      if (t > 1) t = 1;
      if (t < 0) t = 0;

      const lat = animStartLat.current + (animTargetLat.current - animStartLat.current) * t;
      const lng = animStartLng.current + (animTargetLng.current - animStartLng.current) * t;

      setDisplayLat(lat);
      setDisplayLng(lng);
      displayLatRef.current = lat;
      displayLngRef.current = lng;

      if (t < 1) {
        animFrame.current = requestAnimationFrame(step);
      }
    };

    animFrame.current = requestAnimationFrame(step);
  };

  // Initial snapshot fetch
  useEffect(() => {
    let cancelled = false;
    const fetchLocation = async () => {
      try {
        setLoading(true);
        setErrMsg(null);
        const res = await fetch(`${API_BASE}/api/railradar/train/${trainId}`);
        if (!res.ok) {
          throw new Error(`Snapshot fetch failed (${res.status})`);
        }
        const json: LiveLocation = await res.json();
        if (cancelled) return;
        setData(json);
        setDisplayLat(json.lat);
        setDisplayLng(json.lon);
        displayLatRef.current = json.lat;
        displayLngRef.current = json.lon;
        setHistory([[json.lat, json.lon]]);
      } catch (err) {
        console.error("Error fetching live location", err);
        if (!cancelled) {
          setErrMsg("Failed to fetch initial snapshot");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, [trainId]);

  // Socket wiring
  useEffect(() => {
    const onUpdate = (snapshot: LiveLocation) => {
      if (!snapshot || snapshot.trainId !== Number(trainIdRef.current)) return;
      setData(snapshot);

      const currentLat = displayLatRef.current;
      const currentLng = displayLngRef.current;

      if (currentLat === null || currentLng === null) {
        setDisplayLat(snapshot.lat);
        setDisplayLng(snapshot.lon);
        displayLatRef.current = snapshot.lat;
        displayLngRef.current = snapshot.lon;
        setHistory([[snapshot.lat, snapshot.lon]]);
        return;
      }

      startAnimation(currentLat, currentLng, snapshot.lat, snapshot.lon);
      setHistory((h) => [...h, [snapshot.lat, snapshot.lon]].slice(-300));
    };

    socket.on("railradar:train:update", onUpdate);

    return () => {
      if (animFrame.current !== null) cancelAnimationFrame(animFrame.current);
      socket.off("railradar:train:update", onUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  if (!trainId) {
    return <p className="tracker-error">No train selected.</p>;
  }

  const isReady = !loading && data && displayLat !== null && displayLng !== null;

  const center: [number, number] = isReady
    ? [displayLat as number, displayLng as number]
    : [20.5937, 78.9629];

  const route: [number, number][] = data
    ? [
        [data.sourceLat, data.sourceLng],
        [data.destLat, data.destLng],
      ]
    : [center, center];

  const lineColor = data?.status === "ARRIVED"
    ? "#16a34a"
    : data?.status === "RUNNING"
    ? "#f97316"
    : "#9ca3af";

  const progressPct = data ? Math.max(0, Math.min(100, Math.round(data.progress * 100))) : 0;
  const delayMinutes = data?.delayMinutes && Number.isFinite(data.delayMinutes) ? Math.max(0, data.delayMinutes) : 0;

  return (
    <div className="tracker-wrap">
      <div className="tracker-bar">
        <div className="tracker-bar-top">
          <span className="tracker-title">
            {data ? (
              <>
                {data.source} → {data.destination} • {progressPct}% • {data.status}
                {data.status === "RUNNING" && delayMinutes > 0 ? (
                  <span className="tracker-delay"> (Delayed by {delayMinutes} min)</span>
                ) : null}
              </>
            ) : (
              "Loading…"
            )}
          </span>
          <span className="tracker-socket">
            Socket: {socketStatus === "connected" ? "✅" : socketStatus === "error" ? "⚠️" : "…"}
          </span>
        </div>

        <div className="tracker-progress" aria-label="Train progress">
          <progress
            className="tracker-progress-native"
            value={progressPct}
            max={100}
            aria-label="Train journey progress"
          />
          <div className="tracker-progress-meta">{progressPct}% completed</div>

          {data?.startTime ? (
            <div className="tracker-eta">
              {(() => {
                const eta = calculateEtaFromProgress(
                  data.startTime as number,
                  progressPct,
                  computeScheduledDurationMs(data)
                );
                return (
                  <>
                    <div>
                      ETA: <strong>{delayMinutes > 0 ? "Delayed arrival" : eta.label}</strong>
                    </div>
                    {eta.expectedArrivalMs ? (
                      <div>
                        Expected arrival: {new Date(eta.expectedArrivalMs).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      </div>

      {!isReady ? (
        <div className="tracker-loading">
          Loading live location…
          {errMsg && <div className="tracker-error">{errMsg}</div>}
        </div>
      ) : (
        <div className="tracker-map">
          <MapContainer center={route[0]} zoom={6} style={{ width: "100%", height: "100%" }}>
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Polyline positions={route} pathOptions={{ color: lineColor, weight: 4, opacity: 0.8 }} />

            {data && (
              <>
                <Marker position={[data.sourceLat, data.sourceLng]}>
                  <Popup>
                    <strong>Start:</strong> {data.source}
                  </Popup>
                </Marker>

                <Marker position={[data.destLat, data.destLng]}>
                  <Popup>
                    <strong>Destination:</strong> {data.destination}
                  </Popup>
                </Marker>

                <Marker position={center}>
                  <Popup>
                    <div>
                      <strong>{data.trainName}</strong>
                      <br />
                      {data.source} → {data.destination}
                      <br />
                      Status: {data.status}
                      <br />
                      Progress: {(data.progress * 100).toFixed(0)}%
                      <br />
                      Speed: {data.speedKmh ?? "-"} km/h
                      <br />
                      Updated: {new Date(data.recordedAt).toLocaleTimeString()}
                    </div>
                  </Popup>
                </Marker>
              </>
            )}

            {history.length > 1 && (
              <Polyline positions={history} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.6 }} />
            )}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
