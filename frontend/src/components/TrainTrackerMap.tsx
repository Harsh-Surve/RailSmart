import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import trainIconUrl from "../assets/train.png";
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
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!center) return;
    const key = `${center[0].toFixed(6)},${center[1].toFixed(6)}`;
    if (last.current === key) return;
    last.current = key;
    map.setView(center, map.getZoom(), { animate: false });
  }, [center, map]);

  return null;
}

export interface TrainTrackerMapProps {
  trainId: number;
}

export function TrainTrackerMap({ trainId }: TrainTrackerMapProps) {
  const [data, setData] = useState<LiveTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const trainIdRef = useRef(trainId);

  useEffect(() => {
    trainIdRef.current = trainId;
  }, [trainId]);

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

  useEffect(() => {
    let cancelled = false;

    const fetchLive = async () => {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        if (!data) setLoading(true);
        setErrMsg(null);

        const res = await fetch(
          `${API_BASE}/api/trains/${trainIdRef.current}/live-location?demo=1`,
          { headers: { Accept: "application/json" } }
        );

        if (!res.ok) {
          throw new Error(`Live tracking fetch failed (${res.status})`);
        }

        const json: LiveTrackingResponse = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (err) {
        console.error("Error fetching live tracking", err);
        if (!cancelled) setErrMsg("Failed to fetch live tracking");
      } finally {
        inFlight.current = false;
        if (!cancelled) setLoading(false);
      }
    };

    fetchLive();
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    pollTimer.current = window.setInterval(fetchLive, 2000);

    return () => {
      cancelled = true;
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainId]);

  if (!trainId) {
    return <p className="tracker-error">No train selected.</p>;
  }

  const delayMinutes = data?.delayMinutes ? Math.max(0, Number(data.delayMinutes) || 0) : 0;
  const derivedStatus = deriveStatus(data?.status, delayMinutes);

  const lat = parseNumber(data?.latitude ?? data?.lat);
  const lng = parseNumber(data?.longitude ?? data?.lng ?? data?.lon);
  const center: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;

  const sourceLat = parseNumber(data?.sourceLat);
  const sourceLng = parseNumber(data?.sourceLng);
  const destLat = parseNumber(data?.destLat);
  const destLng = parseNumber(data?.destLng);
  const hasRoute = sourceLat != null && sourceLng != null && destLat != null && destLng != null;
  const route: [number, number][] | null = hasRoute
    ? [
        [sourceLat as number, sourceLng as number],
        [destLat as number, destLng as number],
      ]
    : null;

  const mapCenter: [number, number] = center ?? route?.[0] ?? [20.5937, 78.9629];

  const liveEta = parseDate(data?.endTime ?? data?.eta ?? data?.arrivalTime);
  const scheduledArrival = deriveScheduledArrival(liveEta, delayMinutes);
  const trainLabel =
    data?.trainName || data?.trainNumber || data?.trainNo || (trainId ? `Train ${trainId}` : "Train");

  return (
    <div className="tracker-wrap">
      {!center ? (
        <div className="tracker-loading">
          {loading ? "Loading live location…" : "Live location unavailable"}
          {errMsg && <div className="tracker-error">{errMsg}</div>}
        </div>
      ) : (
        <div className="tracker-map">
          <MapContainer center={mapCenter} zoom={6} style={{ width: "100%", height: "100%" }}>
            <MapAutoCenter center={center} />
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {route ? (
              <Polyline positions={route} pathOptions={{ color: "#3b82f6", weight: 4, opacity: 0.7 }} />
            ) : null}

            {hasRoute ? (
              <>
                <Marker position={[sourceLat as number, sourceLng as number]}>
                  <Popup>
                    <strong>Source:</strong> {data?.source || "—"}
                  </Popup>
                </Marker>

                <Marker position={[destLat as number, destLng as number]}>
                  <Popup>
                    <strong>Destination:</strong> {data?.destination || "—"}
                  </Popup>
                </Marker>
              </>
            ) : null}

            <Marker position={center} icon={trainIcon}>
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
