import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { Compass, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getFeaturedRestaurants, getRestaurants } from "@/lib/queries/restaurants";
import { getGuides } from "@/lib/queries/guides";
import { resolveCountryCode } from "@/lib/constants/countries";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { HomeMapVisual } from "@/components/home/HomeMapVisual";
import { HeroVideo } from "@/components/home/HeroVideo";

const MAP_FEATURES = [
  { strong: "Filter by style", rest: "— Central Texas, Carolina, Korean, Argentine, and more" },
  { strong: "Save your favorites", rest: "— build your personal atlas of barbecue" },
  { strong: "Discover nearby", rest: "— find what's worth the drive, wherever you are" },
];

export default async function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);

  const [featured, all, guides] = await Promise.all([
    getFeaturedRestaurants(3),
    getRestaurants(),
    getGuides(),
  ]);

  const count = all.length;
  const countries = new Set(
    all.map((r) => resolveCountryCode(r.country_code, r.country) ?? r.country)
  ).size;
  const styles = new Set(all.map((r) => r.style)).size;
  const stats = [
    { n: count, label: "Restaurants" },
    { n: countries, label: "Countries" },
    { n: styles, label: "BBQ Styles" },
  ];

  return (
    <>
      {/* Hero */}
      <section className="film-grain relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-28 text-center">
        <HeroVideo
          poster="/video/hero-home-poster.jpg"
          webm="/video/hero-home.webm"
          mp4="/video/hero-home.mp4"
        />
        {/* Ember + darkening overlay for legibility and brand tint */}
        <div className="hero-overlay absolute inset-0" />
        <div className="relative z-10 mx-auto max-w-3xl">
          <Image
            src="/logos/crest-emblem.png"
            alt="The BBQ Atlas"
            width={168}
            height={168}
            priority
            className="mx-auto mb-6 h-32 w-32 object-contain [filter:drop-shadow(0_5px_14px_rgba(0,0,0,0.55))_drop-shadow(0_0_6px_rgba(0,0,0,0.4))] sm:h-40 sm:w-40"
          />
          <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-gold/30 bg-brand-gold/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-gold">
            <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-brand-gold shadow-glow-gold" />
            Now tracking {count} restaurants worldwide
          </span>
          <h1 className="font-heading text-5xl font-extrabold leading-[1.05] tracking-tight text-text-primary text-balance sm:text-6xl md:text-7xl">
            The Definitive Guide to{" "}
            <span className="text-brand-gold">World Barbecue</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg font-light leading-relaxed text-text-secondary sm:text-xl">
            Every pit worth visiting. Every style worth knowing. A curated atlas
            of the world&apos;s finest barbecue, built by people who&apos;ve
            eaten their way across it.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/map"
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-8 py-3.5 text-[0.9375rem] font-semibold uppercase tracking-[0.04em] text-text-inverse shadow-glow-gold transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-gold-light"
            >
              <Compass className="h-[18px] w-[18px]" />
              Explore the Map
            </Link>
            <Link
              href="/guides"
              className="inline-flex items-center gap-2 rounded-md border-[1.5px] border-border-strong px-7 py-3.5 text-[0.9375rem] font-medium uppercase tracking-[0.04em] text-text-primary transition-colors duration-200 hover:border-brand-sienna hover:bg-brand-sienna/[0.08] hover:text-brand-sienna-light"
            >
              Read the Guides
            </Link>
          </div>
          <div className="mx-auto mt-16 flex max-w-md justify-center gap-12 border-t border-border-subtle pt-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-heading text-3xl font-bold text-text-primary">
                  {s.n}
                </div>
                <div className="mt-1 text-[0.8125rem] font-medium uppercase tracking-[0.08em] text-text-muted">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured restaurants */}
      <section className="px-6 py-24 sm:px-10">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="u-eyebrow mb-3 text-brand-sienna">Featured</p>
          <h2 className="font-heading text-3xl font-bold text-text-primary sm:text-4xl">
            Restaurants Worth the Journey
          </h2>
          <p className="mt-4 text-lg font-light text-text-muted">
            Hand-picked destinations where the craft of barbecue meets genuine
            excellence.
          </p>
        </div>
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </div>
      </section>

      {/* Map teaser */}
      <section className="border-y border-border-subtle bg-surface-0 px-6 py-24 sm:px-10">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <HomeMapVisual restaurants={all} />
          <div>
            <p className="u-eyebrow mb-3 text-brand-sienna">Interactive Map</p>
            <h2 className="font-heading text-3xl font-bold leading-tight text-text-primary sm:text-4xl">
              Barbecue Has No Borders
            </h2>
            <p className="mt-5 text-lg font-light leading-relaxed text-text-secondary">
              From Texas smokehouses to Korean grillrooms, Argentine asados to
              South African braais. Every pin is a place we&apos;d send a friend.
            </p>
            <ul className="mt-8 space-y-4">
              {MAP_FEATURES.map((f) => (
                <li key={f.strong} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-sienna" />
                  <span className="text-[0.9375rem] text-text-secondary">
                    <strong className="font-semibold text-text-primary">
                      {f.strong}
                    </strong>{" "}
                    {f.rest}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/map"
              className="mt-9 inline-flex items-center gap-2 rounded-md bg-brand-gold px-7 py-3.5 text-[0.9375rem] font-semibold uppercase tracking-[0.04em] text-text-inverse shadow-glow-gold transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-gold-light"
            >
              Open the Map
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Guides */}
      <section className="px-6 py-24 sm:px-10">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="u-eyebrow mb-3 text-brand-sienna">Guides</p>
          <h2 className="font-heading text-3xl font-bold text-text-primary sm:text-4xl">
            Know Your Barbecue
          </h2>
          <p className="mt-4 text-lg font-light text-text-muted">
            Deep dives into the regions, techniques, and traditions that shape
            the world&apos;s great barbecue.
          </p>
        </div>
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 md:grid-cols-2">
          {guides.slice(0, 4).map((g) => (
            <Link
              key={g.id}
              href={`/guides/${g.slug}`}
              className="card-topbar group relative overflow-hidden rounded-xl border border-border-subtle bg-surface-0 p-8 transition-all duration-300 hover:-translate-y-1 hover:border-border-default hover:shadow-lg"
            >
              <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-brand-gold">
                Guide
              </p>
              <h3 className="font-heading text-[1.375rem] font-bold leading-snug text-text-primary">
                {g.title}
              </h3>
              <p className="mt-2.5 line-clamp-2 leading-relaxed text-text-muted">
                {g.excerpt}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold uppercase tracking-[0.04em] text-brand-sienna transition-colors group-hover:text-brand-sienna-light">
                Read the guide
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mission */}
      <section className="relative px-6 py-28 text-center sm:px-10">
        <span className="absolute left-1/2 top-0 h-px w-16 -translate-x-1/2 bg-brand-gold" />
        <blockquote className="mx-auto max-w-3xl font-heading text-2xl font-normal italic leading-snug text-text-primary text-balance sm:text-3xl md:text-[2.25rem]">
          &ldquo;We don&apos;t rank barbecue. We celebrate it. Every style, every
          tradition, every pitmaster who wakes before dawn to tend a fire.&rdquo;
        </blockquote>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.06em] text-brand-gold">
          The BBQ Atlas — Real BBQ. Real Time. Shared Worldwide.
        </p>
      </section>
    </>
  );
}
