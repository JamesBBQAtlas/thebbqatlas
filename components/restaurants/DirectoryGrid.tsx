"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation, Loader2 } from "lucide-react";
import { RestaurantCard } from "./RestaurantCard";
import type { Restaurant } from "@/lib/types/database";
import { distanceMeters, formatDistance } from "@/lib/utils/distance";

const STEP = 24;

/**
 * Progressive directory grid — renders a first batch and reveals more as the
 * visitor nears the end (or taps "Load more"), so a 75+ spot directory stays
 * snappy on a phone. When the visitor shares their location, the grid ranks
 * spots nearest-first and shows the distance to each.
 */
export function DirectoryGrid({ restaurants }: { restaurants: Restaurant[] }) {
  const [count, setCount] = useState(() => Math.min(STEP, restaurants.length));
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locDenied, setLocDenied] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Try to locate the visitor once so we can rank by distance. Permission is
  // remembered per-site, so this won't re-prompt if they've already allowed it
  // (e.g. on the map).
  function locate() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    setLocBusy(true);
    setLocDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocBusy(false);
      },
      () => {
        setLocDenied(true);
        setLocBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  useEffect(() => {
    locate();
  }, []);

  // Rank nearest-first when we know where the visitor is; keep the distance for
  // each spot so we can show it on the card.
  const ranked = useMemo(() => {
    if (!userLoc) return restaurants.map((r) => ({ r, dist: null as number | null }));
    return restaurants
      .map((r) => ({
        r,
        dist: Number.isFinite(r.lat) && Number.isFinite(r.lng)
          ? distanceMeters(userLoc, { lat: r.lat, lng: r.lng })
          : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.dist - b.dist)
      .map((x) => ({ r: x.r, dist: Number.isFinite(x.dist) ? x.dist : null }));
  }, [restaurants, userLoc]);

  // Reset the visible count when the ranking/filter changes.
  useEffect(() => {
    setCount(Math.min(STEP, ranked.length));
  }, [ranked.length, userLoc]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + STEP, ranked.length));
        }
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ranked.length, count]);

  const shown = ranked.slice(0, count);
  const remaining = ranked.length - count;

  return (
    <>
      {/* Location / sort status */}
      <div className="mt-6 flex items-center gap-3 text-sm">
        {userLoc ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-brand-gold">
            <Navigation className="h-3.5 w-3.5" /> Sorted by distance
          </span>
        ) : (
          <button
            type="button"
            onClick={locate}
            disabled={locBusy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-default px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-50"
          >
            {locBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            {locDenied ? "Location off — sort by distance" : "Sort by distance"}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map(({ r, dist }) => (
          <div key={r.id} className="relative">
            {dist != null && (
              <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full border border-border-default bg-background/85 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-text-primary backdrop-blur">
                {formatDistance(dist)}
              </span>
            )}
            <RestaurantCard restaurant={r} />
          </div>
        ))}
      </div>

      {remaining > 0 && (
        <div ref={sentinelRef} className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(c + STEP, ranked.length))}
            className="rounded-md border border-border-default px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Load more ({remaining} more)
          </button>
        </div>
      )}
    </>
  );
}
