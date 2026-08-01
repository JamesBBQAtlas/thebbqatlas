"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils/cn";

export interface PinMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

// Free, keyless raster style (OpenStreetMap tiles). MapExplorer's dark style
// needs a MapTiler key; for the admin pin editor we want visible streets with
// no key, so we use a plain OSM raster source.
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const isValidCoord = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  !(lat === 0 && lng === 0);

export function PinMap({ lat, lng, onChange, className }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Keep the latest onChange without re-initialising the map.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // The coordinate we last emitted / synced, so props-driven updates don't feed
  // back into onChange (avoids an update loop).
  const lastCoordRef = useRef<{ lat: number; lng: number } | null>(null);

  // Init the map once, on the client only.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapRef.current || !containerRef.current) return;

    const valid = isValidCoord(lat, lng);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: valid ? [lng, lat] : [0, 20],
      zoom: valid ? 14 : 1.2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Place or move the draggable marker, then report the new coordinate.
    const placeMarker = (nextLng: number, nextLat: number, emit: boolean) => {
      const rLat = round6(nextLat);
      const rLng = round6(nextLng);
      if (!markerRef.current) {
        const marker = new maplibregl.Marker({ draggable: true, color: "#E85D04" })
          .setLngLat([rLng, rLat])
          .addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLngLat();
          const dLat = round6(p.lat);
          const dLng = round6(p.lng);
          lastCoordRef.current = { lat: dLat, lng: dLng };
          onChangeRef.current(dLat, dLng);
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLngLat([rLng, rLat]);
      }
      if (emit) {
        lastCoordRef.current = { lat: rLat, lng: rLng };
        onChangeRef.current(rLat, rLng);
      }
    };

    if (valid) {
      lastCoordRef.current = { lat: round6(lat), lng: round6(lng) };
      placeMarker(lng, lat, false);
    }

    // Tap / click anywhere places (or moves) the pin. This also handles touch on
    // mobile, where MapLibre fires `click` on tap.
    map.on("click", (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat, true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync marker/center when valid coordinates arrive from outside (e.g. a
  // geocode fills the address). Skip when it matches what we last emitted so we
  // never call onChange in response to our own update.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!isValidCoord(lat, lng)) return;

    const rLat = round6(lat);
    const rLng = round6(lng);
    const last = lastCoordRef.current;
    if (last && last.lat === rLat && last.lng === rLng) return;

    lastCoordRef.current = { lat: rLat, lng: rLng };
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: true, color: "#E85D04" })
        .setLngLat([rLng, rLat])
        .addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        const dLat = round6(p.lat);
        const dLng = round6(p.lng);
        lastCoordRef.current = { lat: dLat, lng: dLng };
        onChangeRef.current(dLat, dLng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([rLng, rLat]);
    }
    map.easeTo({ center: [rLng, rLat], zoom: Math.max(map.getZoom(), 13) });
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={cn("h-64 w-full rounded-md overflow-hidden", className)}
    />
  );
}
