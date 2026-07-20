"use client";

import dynamic from "next/dynamic";
import type { Restaurant } from "@/lib/types/database";

// Lazy-load the map (heavy JS) on the client only — keeps it off the critical path.
const MapExplorer = dynamic(
  () => import("./MapExplorer").then((m) => m.MapExplorer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-surface-0 text-sm uppercase tracking-[0.1em] text-text-muted">
        Loading the map…
      </div>
    ),
  }
);

export function MapCanvas(props: {
  restaurants: Restaurant[];
  mapKey?: string;
  personal?: boolean;
}) {
  return <MapExplorer {...props} />;
}
