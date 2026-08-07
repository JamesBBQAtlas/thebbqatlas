"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Submit-form location picker on MapLibre (Fable M-6 — drops the second map
 * engine; the hero map + admin pin editor already use MapLibre). Click or drag
 * the pin to set the venue's coordinates. Keyless CARTO dark raster tiles match
 * the dark submit theme without needing a MapTiler key.
 */
const DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const isValid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

interface LocationMapProps {
  lat: number;
  lng: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

export function LocationMap({ lat, lng, onLocationSelect }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onLocationSelect);
  onSelectRef.current = onLocationSelect;
  // Last coordinate we emitted/synced, so a props-driven recenter never feeds
  // back into onLocationSelect (avoids an update loop).
  const lastRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || mapRef.current || !containerRef.current) return;
    const valid = isValid(lat, lng);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: valid ? [lng, lat] : [-98, 39],
      zoom: valid ? 13 : 3,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const attachDrag = (m: maplibregl.Marker) => {
      m.on("dragend", () => {
        const p = m.getLngLat();
        const dLat = round6(p.lat);
        const dLng = round6(p.lng);
        lastRef.current = { lat: dLat, lng: dLng };
        onSelectRef.current(dLat, dLng);
      });
    };

    const place = (nlng: number, nlat: number, emit: boolean) => {
      const rLat = round6(nlat);
      const rLng = round6(nlng);
      if (!markerRef.current) {
        const m = new maplibregl.Marker({ draggable: true, color: "#E85D04" })
          .setLngLat([rLng, rLat])
          .addTo(map);
        attachDrag(m);
        markerRef.current = m;
      } else {
        markerRef.current.setLngLat([rLng, rLat]);
      }
      if (emit) {
        lastRef.current = { lat: rLat, lng: rLng };
        onSelectRef.current(rLat, rLng);
      }
    };

    if (valid) {
      lastRef.current = { lat: round6(lat), lng: round6(lng) };
      place(lng, lat, false);
    }
    // Tap / click places (or moves) the pin — handles touch on mobile too.
    map.on("click", (e) => place(e.lngLat.lng, e.lngLat.lat, true));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter / move the pin when coordinates arrive from outside (e.g. the
  // address geocode fills them), skipping our own last-emitted value.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isValid(lat, lng)) return;
    const rLat = round6(lat);
    const rLng = round6(lng);
    const last = lastRef.current;
    if (last && last.lat === rLat && last.lng === rLng) return;
    lastRef.current = { lat: rLat, lng: rLng };
    if (!markerRef.current) {
      const m = new maplibregl.Marker({ draggable: true, color: "#E85D04" })
        .setLngLat([rLng, rLat])
        .addTo(map);
      m.on("dragend", () => {
        const p = m.getLngLat();
        lastRef.current = { lat: round6(p.lat), lng: round6(p.lng) };
        onSelectRef.current(round6(p.lat), round6(p.lng));
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLngLat([rLng, rLat]);
    }
    map.easeTo({ center: [rLng, rLat], zoom: Math.max(map.getZoom(), 13) });
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-lg border border-white/20"
    />
  );
}
