import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Restaurant, Submission } from "@/lib/types/database";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: saved } = await supabase
    .from("saved_spots")
    .select("restaurants(*)")
    .eq("user_id", user.id);

  const { data: submissions } = await supabase
    .from("submissions")
    .select("*")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false });

  const savedRestaurants = (saved ?? [])
    .map((s) => s.restaurants as unknown as Restaurant)
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Atlas</h1>
          <p className="text-white/60">{profile?.display_name ?? user.email}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <Button variant="secondary" type="submit">Sign Out</Button>
        </form>
      </div>

      <section className="mb-12">
        <h2 className="text-xl font-bold text-brand-gold mb-4">Saved Spots</h2>
        {savedRestaurants.length === 0 ? (
          <p className="text-white/50">No saved spots yet. <Link href="/map" className="text-brand-gold hover:underline">Explore the map</Link></p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedRestaurants.map((r) => (
              <RestaurantCard key={r.id} restaurant={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-brand-gold mb-4">My Submissions</h2>
        {(submissions ?? []).length === 0 ? (
          <p className="text-white/50">No submissions yet. <Link href="/submit" className="text-brand-gold hover:underline">Submit a spot</Link></p>
        ) : (
          <div className="space-y-3">
            {(submissions as Submission[]).map((s) => (
              <div key={s.id} className="rounded-lg border border-white/10 bg-black/40 p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-white/50">{s.city}, {s.country} · {STYLE_LABELS[s.style]}</p>
                </div>
                <Badge variant={s.moderation_status === "approved" ? "default" : "style"}>
                  {s.moderation_status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}