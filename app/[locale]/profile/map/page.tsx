import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MapCanvas } from "@/components/map/MapCanvas";
import type { Restaurant } from "@/lib/types/database";

export const metadata = { title: "My Atlas — Map" };
export const dynamic = "force-dynamic";

export default async function MyAtlasMapPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: savedRows } = await supabase
    .from("saved_spots")
    .select("restaurant_id")
    .eq("user_id", user.id);
  const ids = (savedRows ?? []).map((r) => r.restaurant_id);

  let saved: Restaurant[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .in("id", ids)
      .eq("status", "approved");
    saved = (data ?? []) as Restaurant[];
  }

  return (
    <div className="h-[calc(100vh-4.5rem)]">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3">
        <div>
          <h1 className="font-heading text-lg font-bold text-text-primary">
            My Atlas — Saved Spots
          </h1>
          <p className="text-xs text-text-muted">
            {saved.length} saved {saved.length === 1 ? "place" : "places"} on your
            personal map
          </p>
        </div>
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-brand-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to My Atlas
        </Link>
      </div>

      <div className="h-[calc(100%-3.75rem)]">
        {saved.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-text-muted">You haven&apos;t saved any spots yet.</p>
            <Link
              href="/map"
              className="rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90"
            >
              Explore the map
            </Link>
          </div>
        ) : (
          <MapCanvas
            restaurants={saved}
            mapKey={process.env.NEXT_PUBLIC_MAPTILER_KEY}
            personal
          />
        )}
      </div>
    </div>
  );
}
