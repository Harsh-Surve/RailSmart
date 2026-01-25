import L from "leaflet";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

export const DefaultLeafletIcon = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export function applyDefaultLeafletIcon() {
  // Vite + Leaflet: the default marker URLs aren't resolved automatically.
  // Setting the default here prevents missing marker icon issues.
  L.Marker.prototype.options.icon = DefaultLeafletIcon;
}
