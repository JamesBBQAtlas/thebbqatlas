"use client";

import { useEffect, useRef, useState } from "react";
import { RestaurantCard } from "./RestaurantCard";
import type { Restaurant } from "@/lib/types/database";

const STEP = 24;

/**
 * Progressive directory grid — renders a first batch and reveals more as the
 * visitor nears the end (or taps "Load more"), so a 75+ spot directory stays
 * snappy on a phone instead of mounting everything at once.
 */
export function DirectoryGrid({ restaurants }: { restaurants: Restaurant[] }) {
  const [count, setCount] = useState(() => Math.min(STEP, restaurants.length));
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when the filtered set changes (e.g. a new filter/search).
  useEffect(() => {
    setCount(Math.min(STEP, restaurants.length));
  }, [restaurants]);

  // Auto-load the next batch as the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setCount((c) => Math.min(c + STEP, restaurants.length));
        }
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [restaurants.length, count]);

  const shown = restaurants.slice(0, count);
  const remaining = restaurants.length - count;

  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>

      {remaining > 0 && (
        <div ref={sentinelRef} className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setCount((c) => Math.min(c + STEP, restaurants.length))}
            className="rounded-md border border-border-default px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold"
          >
            Load more ({remaining} more)
          </button>
        </div>
      )}
    </>
  );
}
