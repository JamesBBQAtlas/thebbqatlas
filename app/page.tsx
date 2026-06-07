import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { AdSlot } from "@/components/monetization/AdSlot";
import { getFeaturedRestaurants } from "@/lib/queries/restaurants";
import { getGuides } from "@/lib/queries/guides";

export default async function HomePage() {
  const [featured, guides] = await Promise.all([
    getFeaturedRestaurants(3),
    getGuides(),
  ]);

  return (
    <div>
      <section className="relative px-4 py-20 text-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(232,93,4,0.12)_0%,transparent_70%)]" />
        <div className="relative mx-auto max-w-4xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
            Discover the World&apos;s Best BBQ Restaurants
          </h1>
          <p className="mt-4 text-lg text-white/60 max-w-2xl mx-auto">
            Interactive Global Atlas — Explore, Review, and Celebrate BBQ Worldwide
          </p>
          <Button asChild size="lg" className="mt-8 rounded-full px-10">
            <Link href="/map">Open the Map</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <h2 className="text-2xl font-bold mb-6 text-brand-gold">Featured Spots</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featured.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
          <Link href="/map" className="group">
            <div className="rounded-xl border border-white/10 bg-black/60 overflow-hidden h-full hover:border-brand-gold/40 transition-colors">
              <div className="relative aspect-[4/3] bg-gradient-to-br from-[#1a2a3a] via-brand-black to-[#2a1a0a] flex items-center justify-center">
                <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_40%,#EAB308_0%,transparent_40%),radial-gradient(circle_at_70%_60%,#3B82F6_0%,transparent_40%)]" />
                <div className="relative text-center z-10">
                  <p className="text-brand-gold font-bold text-lg">Explore the Atlas</p>
                  <p className="text-white/60 text-sm mt-1">75+ spots worldwide</p>
                </div>
              </div>
              <div className="p-4">
                <p className="font-bold">Open the Interactive Map</p>
                <p className="text-white/60 text-sm mt-1">Style-coded pins · Filters · Deep links</p>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20">
        <h2 className="text-2xl font-bold mb-6 text-brand-gold">Latest Guides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {guides.slice(0, 3).map((guide) => (
            <Link key={guide.id} href={`/guides/${guide.slug}`}>
              <div className="rounded-xl border border-white/10 bg-black/60 overflow-hidden hover:border-brand-gold/40 transition-colors">
                <div className="relative aspect-[16/9]">
                  <Image
                    src={guide.hero_image_url}
                    alt={guide.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4">
                  <h3 className="font-bold">{guide.title}</h3>
                  <p className="text-white/60 text-sm mt-1 line-clamp-2">{guide.excerpt}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <AdSlot slot="homepage" className="mx-auto max-w-7xl px-4 pb-8 h-0" />
    </div>
  );
}