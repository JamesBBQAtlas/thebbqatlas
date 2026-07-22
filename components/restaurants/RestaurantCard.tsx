import Image from "next/image";
import { MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Restaurant } from "@/lib/types/database";
import { STYLE_LABELS, STYLE_PIN_COLORS } from "@/lib/constants/styles";
import {
  CATEGORY_LABELS,
  isTimeBased,
  eventStatus,
  formatEventDates,
} from "@/lib/constants/categories";
import { OFFERINGS_BY_SLUG } from "@/lib/constants/offerings";
import { resolveCountryCode } from "@/lib/constants/countries";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { HeroPlaceholder } from "@/components/restaurants/HeroPlaceholder";
import { safeVenueImage } from "@/lib/restaurants/image";

export function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  const code = resolveCountryCode(r.country_code, r.country);
  const heroSrc = safeVenueImage(r.hero_image_url);
  const firstMeat = (r.offerings ?? [])
    .map((slug) => OFFERINGS_BY_SLUG[slug])
    .find((o) => o?.category === "meats");

  return (
    <Link
      href={`/restaurants/${r.slug}`}
      className="group relative block overflow-hidden rounded-xl border border-border-subtle bg-surface-0 transition-all duration-300 hover:-translate-y-1 hover:border-border-default hover:shadow-lg"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={`${r.name} — ${STYLE_LABELS[r.style]} barbecue`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <HeroPlaceholder variant="card" styleColor={STYLE_PIN_COLORS[r.style]} />
        )}
        {r.is_featured && (
          <span className="absolute left-4 top-4 rounded-sm bg-brand-gold px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-text-inverse shadow-md">
            Featured
          </span>
        )}
        {r.category && r.category !== "restaurant" && (
          <span className="absolute right-4 top-4 rounded-sm bg-surface-0/85 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand-gold shadow-md backdrop-blur-sm">
            {CATEGORY_LABELS[r.category]}
          </span>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-heading text-xl font-bold text-text-primary transition-colors group-hover:text-brand-gold">
          {r.name}
        </h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {[r.city, r.country].filter(Boolean).join(", ")}
          <FlagIcon code={code} className="text-sm" />
        </p>
        {isTimeBased(r.category) &&
          formatEventDates(r.event_starts_at, r.event_ends_at) && (
            <p className="mt-1 text-[0.8125rem] font-semibold text-brand-gold">
              {formatEventDates(r.event_starts_at, r.event_ends_at)}
              {eventStatus(r.event_starts_at, r.event_ends_at) === "past" && (
                <span className="ml-1.5 font-normal text-text-muted">· past</span>
              )}
            </p>
          )}
        <p className="mt-2 line-clamp-2 text-[0.9375rem] leading-relaxed text-text-secondary">
          {r.description}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-brand-sienna bg-brand-sienna/10 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
            {STYLE_LABELS[r.style]}
          </span>
          {firstMeat && (
            <span className="rounded-full border border-border-default px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {firstMeat.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
