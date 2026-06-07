"use client";

import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STYLE_PIN_COLORS, type BbqStyle } from "@/lib/constants/styles";

export function MiniMapInner({
  lat,
  lng,
  name,
  style = "texas",
}: {
  lat: number;
  lng: number;
  name: string;
  style?: BbqStyle;
}) {
  const color = STYLE_PIN_COLORS[style];
  const icon = L.divIcon({
    className: "bbq-marker",
    html: `<svg width="24" height="24" viewBox="0 0 24 36"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/></svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });

  return (
    <div className="h-48 rounded-lg overflow-hidden border border-white/10">
      <MapContainer center={[lat, lng]} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <Marker position={[lat, lng]} icon={icon} title={name} />
      </MapContainer>
    </div>
  );
}