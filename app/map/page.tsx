import dynamic from "next/dynamic";
import { getRestaurants } from "@/lib/queries/restaurants";

const MapClient = dynamic(
  () => import("@/components/map/MapClient").then((m) => m.MapClient),
  { ssr: false, loading: () => (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center text-white/60">
      Loading map...
    </div>
  )}
);

interface MapPageProps {
  searchParams: {
    spot?: string;
    style?: string;
    lat?: string;
    lng?: string;
    zoom?: string;
  };
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const restaurants = await getRestaurants();

  return (
    <MapClient
      restaurants={restaurants}
      initialSpot={searchParams.spot}
      initialStyle={searchParams.style}
      initialLat={searchParams.lat ? parseFloat(searchParams.lat) : undefined}
      initialLng={searchParams.lng ? parseFloat(searchParams.lng) : undefined}
      initialZoom={searchParams.zoom ? parseInt(searchParams.zoom) : undefined}
    />
  );
}