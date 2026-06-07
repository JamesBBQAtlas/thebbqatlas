"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import type { Restaurant } from "@/lib/types/database";
import { createMarkerIcon } from "@/components/map/createMarkerIcon";
import { MapFilters, type MapFilterState } from "@/components/map/MapFilters";
import { MapPreviewPanel } from "@/components/map/MapPreviewPanel";
import { PinLegend } from "@/components/map/PinLegend";
import { MobilePreviewSheet } from "@/components/map/MobilePreviewSheet";
import type { BbqStyle } from "@/lib/constants/styles";

interface MapClientProps {
  restaurants: Restaurant[];
  initialSpot?: string;
  initialStyle?: string;
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
}

function MapController({
  lat,
  lng,
  zoom,
}: {
  lat?: number;
  lng?: number;
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], zoom ?? 10);
    }
  }, [lat, lng, zoom, map]);
  return null;
}

export function MapClient({
  restaurants,
  initialSpot,
  initialStyle,
  initialLat,
  initialLng,
  initialZoom,
}: MapClientProps) {
  const [filters, setFilters] = useState<MapFilterState>({
    style: initialStyle ?? "all",
    rating: "all",
    price: "all",
    search: "",
  });
  const [selected, setSelected] = useState<Restaurant | null>(null);

  const filtered = useMemo(() => {
    return restaurants.filter((r) => {
      if (filters.style !== "all" && r.style !== filters.style) return false;
      if (filters.rating !== "all" && r.avg_rating < parseFloat(filters.rating))
        return false;
      if (filters.price !== "all" && r.price_level !== parseInt(filters.price))
        return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${r.name} ${r.city} ${r.country} ${r.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [restaurants, filters]);

  useEffect(() => {
    if (initialSpot) {
      const spot = restaurants.find((r) => r.slug === initialSpot);
      if (spot) setSelected(spot);
    }
  }, [initialSpot, restaurants]);

  const handleMarkerClick = useCallback((r: Restaurant) => {
    setSelected(r);
    const url = new URL(window.location.href);
    url.searchParams.set("spot", r.slug);
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="relative h-[calc(100vh-64px)] w-full">
      <MapFilters filters={filters} onChange={setFilters} />

      <div className="absolute left-4 bottom-4 z-[1000]">
        <PinLegend />
      </div>

      <MapPreviewPanel restaurant={selected} onClose={() => setSelected(null)} />
      <MobilePreviewSheet restaurant={selected} onClose={() => setSelected(null)} />

      <MapContainer
        center={[30.27, -97.74]}
        zoom={4}
        className="h-full w-full z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapController lat={initialLat} lng={initialLng} zoom={initialZoom} />
        <MarkerClusterGroup chunkedLoading>
          {filtered.map((r) => (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={createMarkerIcon(
                r.style as BbqStyle,
                selected?.id === r.id
              )}
              eventHandlers={{ click: () => handleMarkerClick(r) }}
            />
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}