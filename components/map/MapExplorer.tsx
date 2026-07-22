"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Search, SlidersHorizontal, X, MapPin, Navigation, Loader2, LocateFixed } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import type { Restaurant } from "@/lib/types/database";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";
import { CATEGORY_ORDER, CATEGORY_LABELS_PLURAL } from "@/lib/constants/categories";
import { resolveCountryCode, countryName } from "@/lib/constants/countries";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { MapPreviewCard } from "./MapPreviewCard";
import { cn } from "@/lib/utils/cn";

const GOLD = "#D4AF37";
const SIENNA = "#C4622D";
const INK = "#0C0907";

// Deep ocean blue applied ONLY to water polygons (sea, lakes, rivers). The dark
// base layer and land are left untouched, so land keeps its original colour and
// just the water reads blue.
const OCEAN = "#164770";

// --- Session-scoped view persistence -----------------------------------------
// Remembers where the user was on the map (and their filters) so hitting Back
// from a restaurant page returns them to the same view instead of resetting.
const SESSION_KEY = "bbqatlas:map:v1";

type MapViewState = {
  center?: [number, number];
  zoom?: number;
  style?: string;
  country?: string;
  category?: string;
  query?: string;
  sidebarOpen?: boolean;
};

function readMapState(): MapViewState | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveMapState(patch: MapViewState) {
  if (typeof window === "undefined") return;
  try {
    const prev = readMapState() ?? {};
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// Repaint just the water bodies (sea/lakes/rivers) once the style has loaded.
// We deliberately do NOT touch the background layer — recolouring it bleeds
// through the semi-transparent land and tints the whole map.
function tintWater(map: maplibregl.Map) {
  try {
    for (const layer of map.getStyle().layers ?? []) {
      const id = layer.id.toLowerCase();
      if (
        layer.type === "fill" &&
        (id.includes("water") || id.includes("ocean") || id.includes("sea")) &&
        !id.includes("waterway") // rivers-as-lines are handled separately
      ) {
        map.setPaintProperty(layer.id, "fill-color", OCEAN);
      }
    }
  } catch {
    /* fallback style has no such layers — safe to ignore */
  }
}

// Great-circle distance (metres) between two lat/lng points.
function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// US-heavy audience → miles for en-US, kilometres elsewhere. Trivial to change.
const USE_MILES =
  typeof navigator !== "undefined" && /US/i.test(navigator.language || "");

function formatDistance(m: number): string {
  if (USE_MILES) {
    const mi = m / 1609.34;
    return mi < 0.1 ? "0.1 mi" : mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  const km = m / 1000;
  return km < 0.1 ? "0.1 km" : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

const isMobileViewport = () =>
  typeof window !== "undefined" && window.innerWidth < 640;

// No-key fallback: a flat dark canvas so pins still render during development.
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0E0C0A" } },
  ],
};

export function MapExplorer({
  restaurants,
  mapKey,
  personal = false,
}: {
  restaurants: Restaurant[];
  mapKey?: string;
  personal?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const geoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const router = useRouter();

  // Restore the last view once (client-only; the map is imported ssr:false).
  const [initialState] = useState<MapViewState>(() => readMapState() ?? {});

  const [ready, setReady] = useState(false);
  // Default: list open on desktop, but CLOSED on phones so the map is what you
  // see first (an open full-width list would otherwise cover the whole map).
  const [sidebarOpen, setSidebarOpen] = useState(
    initialState.sidebarOpen ?? !isMobileViewport()
  );

  // The visitor's own location (from the browser) — powers "near me" + sorting.
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [style, setStyle] = useState<string>(initialState.style ?? "all");
  const [country, setCountry] = useState<string>(initialState.country ?? "all");
  const [category, setCategory] = useState<string>(initialState.category ?? "all");
  const [query, setQuery] = useState(initialState.query ?? "");
  const [selected, setSelected] = useState<Restaurant | null>(null);

  // Location (place) search — geocode a city/country/postcode and fly there.
  const [geoBusy, setGeoBusy] = useState(false);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [geoMiss, setGeoMiss] = useState(false);
  const [areaCount, setAreaCount] = useState<number | null>(null);

  const bySlug = useMemo(() => {
    const m = new Map<string, Restaurant>();
    for (const r of restaurants) m.set(r.slug, r);
    return m;
  }, [restaurants]);

  const countries = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of restaurants) {
      const code = resolveCountryCode(r.country_code, r.country) ?? r.country;
      if (code) map.set(code, countryName(code, r.country));
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [restaurants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (style !== "all" && r.style !== style) return false;
      if (category !== "all" && (r.category ?? "restaurant") !== category) return false;
      if (country !== "all" && (resolveCountryCode(r.country_code, r.country) ?? r.country) !== country)
        return false;
      if (q && !`${r.name} ${r.city} ${r.country}`.toLowerCase().includes(q))
        return false;
      return Number.isFinite(r.lat) && Number.isFinite(r.lng);
    });
  }, [restaurants, style, category, country, query]);

  // When we know where the visitor is, order the list nearest-first and keep
  // each spot's distance for display. Without a location, keep the input order.
  const listItems = useMemo(() => {
    if (!userLoc) return filtered.map((r) => ({ r, dist: null as number | null }));
    return filtered
      .map((r) => ({ r, dist: distanceMeters(userLoc, { lat: r.lat, lng: r.lng }) }))
      .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
  }, [filtered, userLoc]);

  const presentCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of restaurants) set.add(r.category ?? "restaurant");
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [restaurants]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filtered.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: {
          slug: r.slug,
          name: r.name,
          location: [r.city, r.country].filter(Boolean).join(", "),
          styleLabel: STYLE_LABELS[r.style],
          featured: r.is_featured ? 1 : 0,
        },
      })),
    }),
    [filtered]
  );

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const styleSpec = mapKey
      ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapKey}`
      : FALLBACK_STYLE;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleSpec,
      center: initialState.center ?? [8, 25],
      zoom: initialState.zoom ?? 1.3,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    // Remember position/zoom as the user pans & zooms.
    map.on("moveend", () => {
      saveMapState({
        center: map.getCenter().toArray() as [number, number],
        zoom: map.getZoom(),
      });
    });

    map.on("load", () => {
      tintWater(map);

      map.addSource("spots", {
        type: "geojson",
        data: geojson as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 8,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "spots",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": GOLD,
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 50, 30],
          "circle-stroke-width": 2,
          "circle-stroke-color": INK,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "spots",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
        },
        paint: { "text-color": INK },
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "spots",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": personal
            ? "#F59E0B"
            : ["case", ["==", ["get", "featured"], 1], GOLD, SIENNA],
          "circle-radius": personal ? 8 : 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": personal ? "#E85D04" : INK,
        },
      });

      map.on("click", "clusters", (e) => {
        const feature = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = feature.properties?.cluster_id;
        const src = map.getSource("spots") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });
      });

      // Click a pin → open the in-map preview card (no full navigation yet).
      map.on("click", "points", (e) => {
        const slug = e.features?.[0]?.properties?.slug as string | undefined;
        const r = slug ? bySlug.get(slug) : undefined;
        if (!r) return;
        popupRef.current?.remove();
        setSelected(r);
        map.easeTo({ center: [r.lng, r.lat], duration: 450 });
      });

      // Click empty water/land → dismiss the card.
      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, {
          layers: ["points", "clusters"],
        });
        if (!hits.length) setSelected(null);
      });

      map.on("mouseenter", "points", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Record<string, string>;
        popupRef.current?.remove();
        // Build the popup with textContent (never HTML interpolation) so a venue
        // name/location can't inject markup/script into the map popup (F-12).
        const pop = document.createElement("div");
        pop.className = "apop";
        const rows: [string, string][] = [
          ["apop-name", p.name ?? ""],
          ["apop-loc", p.location ?? ""],
          ["apop-style", p.styleLabel ?? ""],
          ["apop-hint", "Click for details"],
        ];
        for (const [cls, text] of rows) {
          const row = document.createElement("div");
          row.className = cls;
          row.textContent = text;
          pop.appendChild(row);
        }
        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "atlas-popup",
        })
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setDOMContent(pop)
          .addTo(map);
      });
      map.on("mouseleave", "points", () => {
        map.getCanvas().style.cursor = "";
        popupRef.current?.remove();
        popupRef.current = null;
      });
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]);

  // Push filtered data to the source when filters change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("spots") as maplibregl.GeoJSONSource | undefined;
    src?.setData(geojson as GeoJSON.FeatureCollection);
  }, [geojson, ready]);

  // Persist filters + sidebar state alongside the remembered map position.
  useEffect(() => {
    saveMapState({ style, country, category, query, sidebarOpen });
  }, [style, country, category, query, sidebarOpen]);

  // The map is a flex sibling of the list; when the list opens/closes its width
  // changes, so tell MapLibre to re-measure once the transition settles.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const t = setTimeout(() => m.resize(), 320);
    return () => clearTimeout(t);
  }, [sidebarOpen]);

  // Centre the map on the visitor's own position and drop a "you are here"
  // marker. Also enables nearest-first sorting of the list.
  function locateMe(fly = true) {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLoc({ lat, lng });
        const map = mapRef.current;
        if (map) {
          userMarkerRef.current?.remove();
          const el = document.createElement("div");
          el.className = "atlas-user-marker";
          userMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(map);
          if (fly) map.flyTo({ center: [lng, lat], zoom: 9, speed: 1.4 });
        }
        setLocBusy(false);
      },
      () => setLocBusy(false),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  // F-30: we do NOT auto-fire the geolocation prompt on load — that pops a
  // permission dialog with no user gesture. The visitor taps "Locate me" (which
  // calls locateMe()) when they want the map centered on them.

  function flyTo(r: Restaurant) {
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 12, speed: 1.4 });
  }

  function openPreview(r: Restaurant) {
    setSelected(r);
    flyTo(r);
    // On phones the list covers the map, so reveal the map to show the pin.
    if (isMobileViewport()) setSidebarOpen(false);
  }

  // Geocode the search box as a *place* (city, country, postcode) and move the
  // map there, dropping a marker. Venue-name filtering still happens live in the
  // list; this is the "search by location" path.
  async function searchPlace() {
    const q = query.trim();
    const map = mapRef.current;
    if (!q || !map || geoBusy) return;
    setGeoBusy(true);
    setGeoMiss(false);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const top = Array.isArray(data) ? data[0] : null;
      if (!top) {
        setGeoMiss(true);
        setPlaceLabel(null);
        return;
      }
      const lat = parseFloat(top.lat);
      const lon = parseFloat(top.lon);

      geoMarkerRef.current?.remove();
      const el = document.createElement("div");
      el.className = "atlas-geo-marker";
      geoMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);

      const bbox = top.boundingbox?.map(Number) as
        | [number, number, number, number]
        | undefined;
      let inArea: number;
      if (bbox && bbox.every(Number.isFinite)) {
        const [s, n, w, e] = bbox;
        map.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          { padding: 70, maxZoom: 13, duration: 900 }
        );
        inArea = restaurants.filter(
          (r) => r.lat >= s && r.lat <= n && r.lng >= w && r.lng <= e
        ).length;
      } else {
        map.flyTo({ center: [lon, lat], zoom: 11, speed: 1.4 });
        inArea = restaurants.filter(
          (r) => Math.abs(r.lat - lat) < 0.6 && Math.abs(r.lng - lon) < 0.6
        ).length;
      }

      // Clear the venue text-filter so all nearby pins stay visible at the
      // destination (otherwise the place name filters the map to nothing).
      setQuery("");
      // Trim Nominatim's long display_name to the first few parts.
      setPlaceLabel(
        String(top.display_name || q).split(",").slice(0, 3).join(", ")
      );
      setAreaCount(inArea);
      setSelected(null);
    } catch {
      setGeoMiss(true);
      setPlaceLabel(null);
    } finally {
      setGeoBusy(false);
    }
  }

  function clearPlace() {
    geoMarkerRef.current?.remove();
    geoMarkerRef.current = null;
    setPlaceLabel(null);
    setGeoMiss(false);
    setAreaCount(null);
  }

  // Snapshot the exact current view right before leaving for a full page.
  function persistView() {
    const m = mapRef.current;
    if (m)
      saveMapState({
        center: m.getCenter().toArray() as [number, number],
        zoom: m.getZoom(),
      });
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "z-10 flex h-full flex-col border-r border-border-subtle bg-surface-0 transition-all duration-300",
          sidebarOpen ? "w-full sm:w-[340px]" : "w-0 overflow-hidden sm:w-0"
        )}
      >
        {/* Mobile-only header: get back to the map from the full-width list */}
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:hidden">
          <span className="font-heading text-sm font-bold uppercase tracking-[0.08em] text-text-primary">
            Spots
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <MapPin className="h-3.5 w-3.5" /> View map
          </button>
        </div>
        <div className="border-b border-border-subtle p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (geoMiss) setGeoMiss(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  searchPlace();
                }
              }}
              placeholder="Search a venue, city or country"
              className="w-full rounded-md border border-border-default bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
            />
          </div>

          {/* Location search: geocode the query and fly there */}
          <button
            type="button"
            onClick={searchPlace}
            disabled={!query.trim() || geoBusy}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border-default bg-surface-1 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {geoBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            Jump to a city or place
          </button>

          {placeLabel && (
            <div className="mt-2 rounded-md border border-brand-gold/40 bg-brand-gold/10 px-3 py-1.5">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-gold" />
                <span className="truncate">{placeLabel}</span>
                <button
                  type="button"
                  onClick={clearPlace}
                  aria-label="Clear location"
                  className="ml-auto shrink-0 text-text-muted transition-colors hover:text-text-primary"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {areaCount !== null && (
                <p className="mt-1 pl-[1.375rem] text-[0.6875rem] text-text-muted">
                  {areaCount === 0
                    ? "No Atlas spots here yet"
                    : `${areaCount} Atlas ${areaCount === 1 ? "spot" : "spots"} in this area`}
                </p>
              )}
            </div>
          )}
          {geoMiss && (
            <p className="mt-2 text-xs text-text-muted">
              No place found for “{query.trim()}”. Try a city or country name.
            </p>
          )}

          {presentCategories.length > 1 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-3 w-full rounded-md border border-border-default bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-border-strong focus:outline-none"
            >
              <option value="all">All item types</option>
              {presentCategories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS_PLURAL[c]}
                </option>
              ))}
            </select>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="rounded-md border border-border-default bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-border-strong focus:outline-none"
            >
              <option value="all">All styles</option>
              {BBQ_STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-md border border-border-default bg-surface-1 px-2 py-2 text-sm text-text-primary focus:border-border-strong focus:outline-none"
            >
              <option value="all">All countries</option>
              {countries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs uppercase tracking-[0.08em] text-text-muted">
            {filtered.length} {filtered.length === 1 ? "spot" : "spots"}
          </p>
        </div>

        <ul className="flex-1 overflow-y-auto">
          {listItems.map(({ r, dist }) => (
            <li key={r.id} className="border-b border-border-subtle/60">
              <button
                type="button"
                onClick={() => openPreview(r)}
                onDoubleClick={() => {
                  persistView();
                  router.push(`/restaurants/${r.slug}`);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-1",
                  selected?.id === r.id && "bg-surface-1"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    r.is_featured ? "bg-brand-gold" : "bg-brand-sienna"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text-primary">
                    {r.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                    <MapPin className="h-3 w-3" />
                    {[r.city, r.country].filter(Boolean).join(", ")}
                    <FlagIcon code={resolveCountryCode(r.country_code, r.country)} className="text-xs" />
                  </span>
                  <span className="mt-1 inline-block text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
                    {STYLE_LABELS[r.style]}
                  </span>
                </span>
                {dist != null && (
                  <span className="mt-1 shrink-0 whitespace-nowrap rounded-full border border-border-default bg-surface-1 px-2 py-0.5 text-[0.6875rem] font-semibold text-text-secondary">
                    {formatDistance(dist)}
                  </span>
                )}
              </button>
            </li>
          ))}
          {listItems.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-text-muted">
              No spots match those filters.
            </li>
          )}
        </ul>
      </aside>

      {/* Map */}
      <div className="relative h-full flex-1">
        <div ref={containerRef} className="h-full w-full" />
        <button
          type="button"
          onClick={() => setSidebarOpen((o) => !o)}
          className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-md border border-border-default bg-surface-0/90 px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-text-primary backdrop-blur transition-colors hover:border-border-strong"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
          {sidebarOpen ? "Hide" : "Filters"}
        </button>

        {/* Use my location */}
        <button
          type="button"
          onClick={() => locateMe(true)}
          disabled={locBusy}
          aria-label="Use my location"
          title="Use my location"
          className={cn(
            "absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-md border bg-surface-0/90 backdrop-blur transition-colors hover:border-border-strong disabled:opacity-60",
            userLoc ? "border-brand-gold/70 text-brand-gold" : "border-border-default text-text-primary"
          )}
        >
          {locBusy ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          ) : (
            <LocateFixed className="h-[1.15rem] w-[1.15rem]" />
          )}
        </button>

        {/* Legend */}
        {personal ? (
          <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] left-3 z-10 flex items-center gap-2 rounded-md border border-border-default bg-surface-0/90 px-3 py-2 text-xs text-text-secondary backdrop-blur lg:bottom-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B] ring-2 ring-[#E85D04]" />
            Your saved spots
          </div>
        ) : (
          <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] left-3 z-10 flex items-center gap-4 rounded-md border border-border-default bg-surface-0/90 px-3 py-2 text-xs text-text-secondary backdrop-blur lg:bottom-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" /> Featured
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-sienna" /> Listed
            </span>
          </div>
        )}

        {selected && (
          <MapPreviewCard
            restaurant={selected}
            onClose={() => setSelected(null)}
            onNavigate={persistView}
          />
        )}
      </div>
    </div>
  );
}
