"use client";

import dynamic from "next/dynamic";

const MiniMapInner = dynamic(
  () => import("@/components/restaurants/MiniMapInner").then((m) => m.MiniMapInner),
  { ssr: false, loading: () => <div className="h-48 bg-black/40 rounded-lg animate-pulse" /> }
);

export function MiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return <MiniMapInner lat={lat} lng={lng} name={name} />;
}