"use client";

import dynamic from "next/dynamic";
import type { Restaurant } from "@/lib/types/database";
import type { PublicRestaurant } from "@/lib/types/public";

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
  restaurants: PublicRestaurant[];
  closedRestaurants?: PublicRestaurant[];
  mapKey?: string;
  personal?: boolean;
}) {
  // B4: pages hand us PUBLIC-only rows (projected upstream), so owner/ops columns
  // never reach the browser. MapExplorer is still typed against the internal
  // `Restaurant` shape but reads only public fields (it defensively no-ops on the
  // optional `status`), so we bridge the type at this single seam rather than
  // threading PublicRestaurant through its ~1,200 lines.
  return (
    <MapExplorer
      restaurants={props.restaurants as unknown as Restaurant[]}
      closedRestaurants={props.closedRestaurants as unknown as Restaurant[] | undefined}
      mapKey={props.mapKey}
      personal={props.personal}
    />
  );
}
