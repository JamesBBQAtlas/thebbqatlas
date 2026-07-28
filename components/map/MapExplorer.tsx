"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Search, SlidersHorizontal, X, MapPin, Navigation, Loader2, LocateFixed } from "lucide-react";
import { useSearchParams } from "next/navigation";
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

// Pit Zero (easter egg) — a single UNLABELLED fox at a founder-meaningful
// coordinate. Injected client-side only: never in the dataset, sitemap or JSON-LD.
const PIT_ZERO = { lat: 51.511191, lng: -0.136537 };
const PIT_ZERO_PHRASES = new Set(["pit zero", "lowandslow"]);

// A small fox silhouette (internally "Basil") — original artwork, two pointed
// ears and a narrowing muzzle. Drops into the DOM marker; coloured/glowed in CSS.
const FOX_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3 L9 9 C10.5 8.3 13.5 8.3 15 9 L21 3 L19.3 12.2 C18.4 16 15.4 18.6 12 20.4 C8.6 18.6 5.6 16 4.7 12.2 Z"/></svg>';

/** The same fox as an inline icon, for the Pit Zero card badge. */
function FoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 3 L9 9 C10.5 8.3 13.5 8.3 15 9 L21 3 L19.3 12.2 C18.4 16 15.4 18.6 12 20.4 C8.6 18.6 5.6 16 4.7 12.2 Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Map search-box easter eggs (EASTER-EGGS-SPEC §Eggs 6–9). All client-side,
// ephemeral, and words-only allusions — every marker below is ORIGINAL art; no
// character images, likenesses, show artwork, or copyrighted audio. Injected on
// trigger only (no CWV cost otherwise); never in the dataset, sitemap or JSON-LD.
// ---------------------------------------------------------------------------

// Original marker art (our own glyphs — a fish, a star-spark, a broadcast dot).
const KIPPER_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 12 C6 6.5 13 6.5 17 10 L22 6.5 L20.6 12 L22 17.5 L17 14 C13 17.5 6 17.5 2 12 Z"/><circle cx="15" cy="10.8" r="1" fill="#0C0907"/></svg>';
const STAR_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 L14.2 8.6 L21 8.6 L15.4 12.7 L17.6 19.4 L12 15.2 L6.4 19.4 L8.6 12.7 L3 8.6 L9.8 8.6 Z"/></svg>';
const RADIO_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M8 8 A6 6 0 0 0 8 16 M16 8 A6 6 0 0 1 16 16 M5 5 A10 10 0 0 0 5 19 M19 5 A10 10 0 0 1 19 19" stroke-width="1.5" stroke-linecap="round"/></svg>';
const OWL_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 C6.8 3 4 6.6 4 11.2 C4 16.2 7.6 21 12 21 C16.4 21 20 16.2 20 11.2 C20 6.6 17.2 3 12 3 Z"/><circle cx="9" cy="10" r="2.3" fill="#0C0907"/><circle cx="15" cy="10" r="2.3" fill="#0C0907"/><circle cx="9" cy="10" r="0.9" fill="#e2703a"/><circle cx="15" cy="10" r="0.9" fill="#e2703a"/><path d="M12 12.4 L10.6 14 L13.4 14 Z" fill="#0C0907"/></svg>';
// An original grinning shark — blue body (currentColor), open toothy mouth and
// a dorsal fin. Our own glyph, no film artwork/likeness.
const SHARK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M1.6 12.5 C3.2 9 7 7.1 11 7.4 C14 7.6 16.8 8.8 19.4 11 L22.6 8.4 L21.4 12.5 L22.6 16.4 L19.4 13.8 C16.8 15.9 14 17.1 11 17.3 C7 17.6 3.2 15.8 1.6 12.5 Z"/>' +
  '<path fill="currentColor" d="M9.6 7.5 C10.2 4.1 12.4 3.4 13.6 6.7 C12.3 6.9 10.9 7.1 9.6 7.5 Z"/>' +
  '<path fill="#0B1B2E" d="M1.7 12.4 C2.7 11.2 4.3 10.6 5.9 10.5 L6.6 12.4 L5.7 14.3 C4 14.1 2.6 13.5 1.7 12.4 Z"/>' +
  '<path fill="#ffffff" d="M2.4 11.6 L3.4 12.5 L2.5 13.2 Z M3.8 11.1 L4.7 12.2 L3.7 12.6 Z M3.7 13.9 L4.4 12.7 L5.1 13.7 Z M5.1 11.1 L5.7 12.2 L4.9 12.5 Z"/>' +
  '<circle cx="9.2" cy="10" r="0.95" fill="#0B1B2E"/>' +
  "</svg>";

interface EggSecondary {
  link: string; // link text shown on the primary card
  coord: { lat: number; lng: number };
  zoom: number;
  cardLabel: string;
  cardBody: string;
}
interface MapEgg {
  id: string;
  phrases: string[]; // lowercased, trimmed triggers
  coord: { lat: number; lng: number };
  zoom: number;
  fast?: boolean; // superhuman-speed flyTo (Bionic)
  svg: string;
  markerClass?: string; // override marker colour/glow (e.g. blue shark)
  cardLabel: string;
  cardBody: string;
  seal?: boolean; // Bionic "blessed" angel+star seal
  secondary?: EggSecondary;
}

// Bionic's quarry: Pitt River Quarries, Pitt Meadows BC — the confirmed spot
// James supplied for where the 2007 series filmed near Vancouver.
const BIONIC_QUARRY = { lat: 49.28647, lng: -122.65856 };

const MAP_EGGS: MapEgg[] = [
  {
    id: "kipper",
    phrases: ["smoke me a kipper", "smoke me a kipper, i'll be back for breakfast"],
    coord: { lat: 51.509, lng: -0.0838 }, // historic Billingsgate, Lower Thames St
    zoom: 14.5,
    svg: KIPPER_SVG,
    cardLabel: "Billingsgate",
    cardBody:
      "Smoke me a kipper — I'll be back for breakfast. This is Billingsgate, London's fish market since the 1800s, about the closest a smoked herring gets to a pin on a barbecue map. Ace Rimmer would approve. What a guy.",
    secondary: {
      link: "→ But the real home of the kipper is up north. Take me to Craster.",
      coord: { lat: 55.473, lng: -1.594 }, // Craster, Northumberland
      zoom: 13.5,
      cardLabel: "Craster",
      cardBody:
        "Craster, Northumberland. Oak-smoked herring in the same sheds since the 1850s — the definitive kipper. Worth the trip; worth the smell in the car.",
    },
  },
  {
    id: "bionic",
    phrases: ["bionic", "jaime sommers"],
    coord: BIONIC_QUARRY,
    zoom: 13,
    fast: true,
    svg: STAR_SVG,
    cardLabel: "Bionic",
    cardBody:
      "A quarry outside Vancouver, where a bionic woman was rebuilt better, stronger, faster. The same someone who gave this whole map its warmth — and lends it her voice. We had the technology. We pointed it at brisket.",
    seal: true,
  },
  {
    id: "partridge-norwich",
    phrases: ["cookpassbabtridge"],
    coord: { lat: 52.6284, lng: 1.2909 }, // The Forum, Norwich
    zoom: 15,
    svg: RADIO_SVG,
    cardLabel: "BBC Radio Norwich",
    cardBody:
      "Ah-ha. BBC Radio Norwich. Not a barbecue joint — but a very good building, in a very good city, run by a broadcasting legend (in his own mind). Back to the smoke?",
  },
  {
    id: "owl-sanctuary",
    phrases: ["cracking owl sanctuary"],
    coord: { lat: 52.5433, lng: 1.6389 }, // Fritton Owl Sanctuary, Fritton (Great Yarmouth), Norfolk
    zoom: 14.5,
    svg: OWL_SVG,
    cardLabel: "Fritton Owl Sanctuary",
    cardBody:
      "Not barbecue. But a cracking owl sanctuary. Sometimes a man just needs to look at an owl. Back to the map when you're ready.",
  },
  {
    id: "jaws",
    phrases: ["jaws", "amity island"],
    coord: { lat: 41.4174, lng: -70.5533 }, // Joseph Sylvia State Beach ("Jaws Bridge"), Martha's Vineyard, MA
    zoom: 12.5,
    svg: SHARK_SVG,
    markerClass: "atlas-egg-marker atlas-egg-marker--shark",
    cardLabel: "Amity Island",
    cardBody:
      "Amity Island — better known as Martha's Vineyard, where in 1975 a mechanical shark ruined swimming for an entire generation. No barbecue here: the only thing well-smoked was the mayor's re-election campaign. Still, you're gonna need a bigger plate. We recommend the brisket — on dry land, facing the exit.",
  },
];

// "Back of the net!" (Egg 9) — a Surprise-Me in disguise; picks a real
// published venue. Kept separate from MAP_EGGS (no fixed coordinate/art).
const BACK_OF_NET_PHRASES = new Set(["back of the net", "back of the net!"]);

/** What the ephemeral egg card is currently showing. */
interface EggCardState {
  label: string;
  body: string;
  seal?: boolean;
  secondary?: EggSecondary;
}

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
  const pitMarkerRef = useRef<maplibregl.Marker | null>(null);
  const eggMarkersRef = useRef<maplibregl.Marker[]>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Restore the last view once (client-only; the map is imported ssr:false).
  const [initialState] = useState<MapViewState>(() => readMapState() ?? {});

  // Deep link from a venue mini-map ("Full map →"): ?venue=<slug>&bbox=w,s,e,n.
  // Read ONCE so later param changes can't retrigger it. When present it takes
  // precedence over the remembered session view for the initial frame.
  const [deepLink] = useState<{
    venue: string | null;
    bbox: [number, number, number, number] | null;
  }>(() => {
    const venue = searchParams?.get("venue") ?? null;
    const raw = searchParams?.get("bbox");
    let bbox: [number, number, number, number] | null = null;
    if (raw) {
      const p = raw.split(",").map(Number);
      if (p.length === 4 && p.every(Number.isFinite)) {
        bbox = [p[0], p[1], p[2], p[3]];
      }
    }
    return { venue, bbox };
  });

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
  const [pitZero, setPitZero] = useState(false);
  const [homage, setHomage] = useState(false);
  // Search-box eggs (§Eggs 6–9): the ephemeral card + the "back of the net" toast.
  const [eggCard, setEggCard] = useState<EggCardState | null>(null);
  const [netToast, setNetToast] = useState(false);

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

    // Lazy-mount the GL canvas after first paint (F-23): let the page shell and
    // controls paint before MapLibre's WebGL init runs, so it never blocks the
    // first paint of the flagship map route.
    const raf = requestAnimationFrame(() => {
      if (mapRef.current || !containerRef.current) return;
      const styleSpec = mapKey
        ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapKey}`
        : FALLBACK_STYLE;

      // A venue deep link frames the bbox on load; construct near its centre so
      // there's no visible jump from the world view before fitBounds runs.
      const dlCenter: [number, number] | undefined = deepLink.bbox
        ? [
            (deepLink.bbox[0] + deepLink.bbox[2]) / 2,
            (deepLink.bbox[1] + deepLink.bbox[3]) / 2,
          ]
        : undefined;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: styleSpec,
        center: dlCenter ?? initialState.center ?? [8, 25],
        zoom: dlCenter ? 11 : initialState.zoom ?? 1.3,
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

      // Venue deep link: frame the venue + its neighbours and open its card so
      // the pin arrives selected (not reset to the remembered world view).
      if (deepLink.bbox) {
        const [w, s, e, n] = deepLink.bbox;
        map.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          { padding: 64, maxZoom: 15, duration: 0 }
        );
      }
      if (deepLink.venue) {
        const r = bySlug.get(deepLink.venue);
        if (r) setSelected(r);
      }

      setReady(true);
    });
    }); // end requestAnimationFrame — GL init deferred to after first paint

    return () => {
      cancelAnimationFrame(raf);
      mapRef.current?.remove();
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
          if (fly) map.flyTo(animate({ center: [lng, lat], zoom: 9, speed: 1.4 }));
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

  // Respect prefers-reduced-motion: jump instantly instead of animating (F-22).
  function animate<T extends Record<string, unknown>>(opts: T): T {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return { ...opts, duration: 0 };
    }
    return opts;
  }

  function flyTo(r: Restaurant) {
    mapRef.current?.flyTo(animate({ center: [r.lng, r.lat], zoom: 12, speed: 1.4 }));
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
    const lc = q.toLowerCase();
    if (PIT_ZERO_PHRASES.has(lc)) {
      triggerPitZero();
      return;
    }
    if (BACK_OF_NET_PHRASES.has(lc)) {
      triggerBackOfNet();
      return;
    }
    const egg = MAP_EGGS.find((e) => e.phrases.includes(lc));
    if (egg) {
      triggerMapEgg(egg);
      return;
    }
    clearPitZero();
    clearEggs();
    // If the query matches a venue by NAME, hitting Enter jumps straight to that
    // venue (opens its card + flies there), and on mobile reveals the map. This
    // also fixes the mobile case where entering a name left you stuck on the
    // filters panel. City/country-only matches fall through to place search.
    const nameMatch = filtered.find((r) => r.name.toLowerCase().includes(lc));
    if (nameMatch) {
      openPreview(nameMatch); // selects, flies, and closes the sidebar on mobile
      return;
    }
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
          animate({ padding: 70, maxZoom: 13, duration: 900 })
        );
        inArea = restaurants.filter(
          (r) => r.lat >= s && r.lat <= n && r.lng >= w && r.lng <= e
        ).length;
      } else {
        map.flyTo(animate({ center: [lon, lat], zoom: 11, speed: 1.4 }));
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
      // Reveal the map on mobile (the search lives in the full-width panel).
      if (isMobileViewport()) setSidebarOpen(false);
    } catch {
      setGeoMiss(true);
      setPlaceLabel(null);
    } finally {
      setGeoBusy(false);
    }
  }

  // Pit Zero: cinematic fly-in + a single fox ("Basil") + the card. Ephemeral —
  // clearing the search or dismissing removes it; it never enters filters.
  function triggerPitZero() {
    const map = mapRef.current;
    if (!map) return;
    clearPlace();
    pitMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "atlas-pit-zero-marker";
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Pit Zero"); // the fox stays UNLABELLED on the map
    el.innerHTML = FOX_SVG;
    el.addEventListener("click", () => setPitZero(true));
    pitMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([PIT_ZERO.lng, PIT_ZERO.lat])
      .addTo(map);
    setSelected(null);
    setQuery("");
    setHomage(false);
    setPitZero(true);
    if (isMobileViewport()) setSidebarOpen(false);
    map.flyTo(
      animate({
        center: [PIT_ZERO.lng, PIT_ZERO.lat],
        zoom: 15.5,
        speed: 0.5,
        curve: 1.6,
      })
    );
  }

  function clearPitZero() {
    pitMarkerRef.current?.remove();
    pitMarkerRef.current = null;
    setHomage(false);
    setPitZero(false);
  }

  // --- Search-box eggs 6–9 (ephemeral, original art only) --------------------
  function clearEggs() {
    for (const m of eggMarkersRef.current) m.remove();
    eggMarkersRef.current = [];
    setEggCard(null);
  }

  function dropEggMarker(
    coord: { lat: number; lng: number },
    svg: string,
    className = "atlas-egg-marker"
  ) {
    const map = mapRef.current;
    if (!map) return;
    const el = document.createElement("div");
    el.className = className;
    el.innerHTML = svg;
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([coord.lng, coord.lat])
      .addTo(map);
    eggMarkersRef.current.push(marker);
  }

  // A search-triggered map egg: clear everything else, drop an original marker,
  // cinematic (or superhuman-fast, for Bionic) flyTo, then show the card.
  function triggerMapEgg(egg: MapEgg) {
    const map = mapRef.current;
    if (!map) return;
    clearPlace();
    clearPitZero();
    clearEggs();
    setSelected(null);
    setQuery("");
    dropEggMarker(egg.coord, egg.svg, egg.markerClass ?? "atlas-egg-marker");
    if (isMobileViewport()) setSidebarOpen(false);
    setEggCard({ label: egg.cardLabel, body: egg.cardBody, seal: egg.seal, secondary: egg.secondary });
    map.flyTo(
      animate(
        egg.fast
          ? { center: [egg.coord.lng, egg.coord.lat], zoom: egg.zoom, speed: 3.2, curve: 1, essential: true }
          : { center: [egg.coord.lng, egg.coord.lat], zoom: egg.zoom, speed: 0.7, curve: 1.5 }
      )
    );
  }

  // Kipper follow-on: fly north to Craster and swap the card.
  function triggerEggSecondary(sec: EggSecondary, svg: string) {
    const map = mapRef.current;
    if (!map) return;
    dropEggMarker(sec.coord, svg);
    setEggCard({ label: sec.cardLabel, body: sec.cardBody });
    map.flyTo(
      animate({ center: [sec.coord.lng, sec.coord.lat], zoom: sec.zoom, speed: 0.75, curve: 1.5 })
    );
  }

  // "Back of the net!" (Egg 9) — a Surprise-Me: fly to a random REAL published
  // venue, open its card, and flash a toast. Never a seed/draft.
  function triggerBackOfNet() {
    clearPlace();
    clearPitZero();
    clearEggs();
    setQuery("");
    const pool = restaurants.filter(
      (r) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng) &&
        !(r.lat === 0 && r.lng === 0) &&
        (r.status ? r.status === "approved" : true)
    );
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelected(pick);
    mapRef.current?.flyTo(animate({ center: [pick.lng, pick.lat], zoom: 13, speed: 1.6, curve: 1.4 }));
    if (isMobileViewport()) setSidebarOpen(false);
    setNetToast(true);
    window.setTimeout(() => setNetToast(false), 2600);
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

        {pitZero && (
          <div className="absolute inset-x-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-20 mx-auto max-w-sm rounded-xl border border-brand-gold/40 bg-surface-0/95 p-5 shadow-xl backdrop-blur lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-brand-gold">
                <FoxIcon className="h-3 w-3" /> Pit Zero
              </span>
              <button
                type="button"
                onClick={clearPitZero}
                aria-label="Close"
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              Pit Zero. Where every atlas begins — a fire, some patience, a Smoky
              Old Fashioned, and someone who refused to rush it. There was a fox
              here once. If you know, you know.
            </p>
            {/* Secret homage — reads as whimsy to a stranger, unmistakable to one. */}
            <button
              type="button"
              onClick={() => setHomage((h) => !h)}
              aria-label="A fox"
              aria-expanded={homage}
              className="mt-3 text-base leading-none opacity-40 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
            >
              🦊
            </button>
            {homage && (
              <p className="mt-2 text-xs italic leading-relaxed text-text-muted">
                For Hix — a very good room on a Soho street, long since closed —
                and for Basil, who watched the whole thing from the bar.
              </p>
            )}
          </div>
        )}

        {/* Search-box eggs 6–8: ephemeral card (original art only, words-only allusions). */}
        {eggCard && (
          <div className="absolute inset-x-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.5rem)] z-20 mx-auto max-w-sm rounded-xl border border-brand-sienna/40 bg-surface-0/95 p-5 shadow-xl backdrop-blur lg:bottom-6 lg:left-6 lg:right-auto lg:mx-0">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-brand-sienna-light">
                <MapPin className="h-3 w-3" /> {eggCard.label}
              </span>
              <button
                type="button"
                onClick={clearEggs}
                aria-label="Close"
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{eggCard.body}</p>
            {/* Bionic "blessed" seal — original angel+star mark, no likeness. */}
            {eggCard.seal && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-1 text-xs font-semibold text-brand-gold">
                <span aria-hidden="true">⭐👼</span> Blessed by Michelle Ryan herself
              </p>
            )}
            {/* Kipper → Craster follow-on link. */}
            {eggCard.secondary && (
              <button
                type="button"
                onClick={() => {
                  const sec = eggCard.secondary;
                  if (sec) triggerEggSecondary(sec, KIPPER_SVG);
                }}
                className="mt-3 text-left text-sm font-semibold text-brand-gold transition-colors hover:text-brand-gold-light hover:underline"
              >
                {eggCard.secondary.link}
              </button>
            )}
          </div>
        )}

        {/* "Back of the net!" toast (Egg 9). */}
        {netToast && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center">
            <span className="rounded-full border border-brand-gold/50 bg-surface-0/95 px-4 py-2 font-heading text-sm font-bold uppercase tracking-[0.08em] text-brand-gold shadow-xl backdrop-blur">
              Back of the net!
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
