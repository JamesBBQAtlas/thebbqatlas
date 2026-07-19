import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { MiniMap } from "@/components/restaurants/MiniMap";
import { AddToAtlas } from "@/components/restaurants/AddToAtlas";
import { ReviewForm } from "@/components/restaurants/ReviewForm";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { AdSlot } from "@/components/monetization/AdSlot";
import {
  getRestaurantBySlug,
  getRestaurants,
  getSignatureDishes,
  getGearItems,
  getReviews,
} from "@/lib/queries/restaurants";
import { STYLE_LABELS } from "@/lib/constants/styles";
import { findNearby } from "@/lib/utils/geo";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) return { title: "Restaurant Not Found" };
  return { title: restaurant.name, description: restaurant.description };
}

export default async function RestaurantPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  if (restaurant.slug !== params.slug) redirect(`/restaurants/${restaurant.slug}`);

  const [dishes, gear, reviews, allRestaurants] = await Promise.all([
    getSignatureDishes(restaurant.id),
    getGearItems(restaurant.id),
    getReviews(restaurant.id),
    getRestaurants(),
  ]);

  const nearby = findNearby(allRestaurants, restaurant.lat, restaurant.lng);

  let isLoggedIn = false;
  let isSaved = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isLoggedIn = !!user;
    if (user) {
      const { data } = await supabase
        .from("saved_spots")
        .select("id")
        .eq("user_id", user.id)
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();
      isSaved = !!data;
    }
  } catch {
    // fallback
  }

  const defaultDishes = dishes.length
    ? dishes
    : [
        { id: "1", name: "Signature Brisket", description: "House-smoked until tender", affiliate_url: "#", affiliate_label: "Buy on Amazon", restaurant_id: restaurant.id, sort_order: 0 },
        { id: "2", name: "House Sausage", description: "Craft sausage with regional spices", affiliate_url: "#", affiliate_label: "Shop ThermoWorks", restaurant_id: restaurant.id, sort_order: 1 },
      ];

  const defaultGear = gear.length
    ? gear
    : [
        { id: "1", name: "Weber Smokey Mountain", affiliate_url: "#", restaurant_id: restaurant.id, sort_order: 0 },
        { id: "2", name: "ThermoWorks Thermapen", affiliate_url: "#", restaurant_id: restaurant.id, sort_order: 1 },
      ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="relative aspect-[21/9] w-full rounded-xl overflow-hidden mb-8">
        <Image src={restaurant.hero_image_url} alt={restaurant.name} fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-transparent to-transparent" />
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Badge variant="style" className="mb-2">{STYLE_LABELS[restaurant.style]}</Badge>
              <h1 className="text-3xl md:text-4xl font-bold">{restaurant.name}</h1>
              <p className="text-white/70 mt-1">{restaurant.address}</p>
            </div>
            <AddToAtlas restaurantId={restaurant.id} initialSaved={isSaved} isLoggedIn={isLoggedIn} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section>
            <p className="text-white/80 leading-relaxed">{restaurant.description}</p>
            <p className="mt-2 text-brand-gold">
              {"$".repeat(restaurant.price_level)}
              <span className="text-white/30">{"$".repeat(4 - restaurant.price_level)}</span>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-brand-gold mb-4">Signature Dishes</h2>
            <div className="space-y-3">
              {defaultDishes.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/40 p-4">
                  <div>
                    <p className="font-semibold">{d.name}</p>
                    {d.description && <p className="text-sm text-white/60">{d.description}</p>}
                  </div>
                  <AffiliateLink href={d.affiliate_url} label={d.affiliate_label} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-brand-gold mb-4">Gear We Use</h2>
            <div className="flex flex-wrap gap-2">
              {defaultGear.map((g) => (
                <AffiliateLink key={g.id} href={g.affiliate_url} label={g.name} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-brand-gold mb-4">Reviews</h2>
            <AdSlot slot="between-reviews" className="mb-4 h-0" />
            <div className="space-y-4 mb-6">
              {reviews.length === 0 && (
                <p className="text-white/50">No reviews yet — be the first!</p>
              )}
              {reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-white/10 bg-black/40 p-4">
                  <p className="text-sm text-white/50">
                    {review.profiles?.display_name ?? "Anonymous"}
                  </p>
                  <p className="mt-2 text-white/80">{review.body}</p>
                </div>
              ))}
            </div>
            <ReviewForm restaurantId={restaurant.id} />
          </section>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-bold mb-3">Location</h2>
            <MiniMap lat={restaurant.lat} lng={restaurant.lng} name={restaurant.name} />
          </section>
          <AdSlot slot="sidebar" className="h-0" />
          <section>
            <h2 className="text-lg font-bold mb-3">Nearby Spots</h2>
            <div className="space-y-3">
              {nearby.map((r) => (
                <Link key={r.id} href={`/restaurants/${r.slug}`} className="block rounded-lg border border-white/10 bg-black/40 p-3 hover:border-brand-gold/40 transition-colors">
                  <p className="font-semibold text-sm">{r.name}</p>
                  <p className="text-xs text-white/50">{r.city}, {r.country}</p>
                </Link>
              ))}
              {nearby.length === 0 && <p className="text-white/50 text-sm">No nearby spots in range.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}