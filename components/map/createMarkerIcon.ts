import L from "leaflet";
import { STYLE_PIN_COLORS, type BbqStyle } from "@/lib/constants/styles";

export function createMarkerIcon(style: BbqStyle, selected = false): L.DivIcon {
  const color = STYLE_PIN_COLORS[style];
  const size = selected ? 36 : 28;

  return L.divIcon({
    className: "bbq-marker",
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="${selected ? "#D4AF37" : "#1A1A1A"}" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
    </svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}