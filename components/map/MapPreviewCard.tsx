"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight, MapPin, Wine, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Restaurant } from "@/lib/types/database";
import { STYLE_LABELS } from "@/lib/constants/styles";
import { OFFERINGS_BY_SLUG } from "@/lib/constants/offerings";
import { resolveCountryCode } from "@/lib/constants/countries";
import { FlagIcon } from "@/components/ui/FlagIcon";

const ALCOHOL_SHORT: Record<string, string> = {
  serves: "Full bar",
  byob: "BYOB",
  both: "Bar + BYOB",
};

/**
 * A rich summary card that floats over the map when a pin is selected.
 * Lets the user browse without leaving the map; the CTA is the "proper"
 * click-through to the full restaurant page (with reviews, photos, etc.).
 */
export function MapPreviewCard({
  restaurant: r,
  onClose,
  onNavigate,
}: {
  restaurant: Restaurant;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const code = resolveCountryCode(r.country_code, r.country);
  const firstMeat = (r.offerings ?? [])
    .map((slug) => OFFERINGS_BY_SLUG[slug])
    .find((o) => o?.category === "meats");
  const price = r.price_level
    ? "$".repeat(Math.max(1, Math.min(4, r.price_level)))
    : "";
  const alcohol =
    r.alcohol && r.alcohol !== "none" ? ALCOHOL_SHORT[r.alcohol] : null;

  return (
    <div
      className="atlas-card-enter pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-[420px] overflow-hidden rounded-xl border border-border-default bg-surface-0 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:mx-0 sm:w-[358px]"
      role="dialog"
      aria-label={`${r.name} preview`}
    >
      {/* Cover */}
      <div className="relative h-40 w-full">
        {r.hero_image_url && imgOk ? (
          <Image
            src={r.hero_image_url}
            alt={`${r.name} — ${STYLE_LABELS[r.style]} barbecue`}
            fill
            sizes="420px"
            className="object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-surface-2 via-surface-1 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        {r.is_featured && (
          <span className="absolute left-3 top-3 rounded-sm bg-brand-gold px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] text-text-inverse shadow-md">
            Featured
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="absolute inset-x-3 bottom-2 font-heading text-lg font-bold leading-tight text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.6)]">
          {r.name}
        </h3>
      </div>

      {/* Body */}
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-text-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          {[r.city, r.country].filter(Boolean).join(", ")}
          <FlagIcon code={code} className="text-sm" />
        </p>

        {r.description && (
          <p className="mt-2 line-clamp-3 text-[0.875rem] leading-relaxed text-text-secondary">
            {r.description}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-brand-sienna bg-brand-sienna/10 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna">
            {STYLE_LABELS[r.style]}
          </span>
          {firstMeat && (
            <span className="rounded-full border border-border-default px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {firstMeat.label}
            </span>
          )}
          {alcohol && (
            <span className="flex items-center gap-1 rounded-full border border-border-default px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <Wine className="h-3 w-3" />
              {alcohol}
            </span>
          )}
          {price && (
            <span className="ml-auto text-sm font-semibold tracking-wide text-brand-gold">
              {price}
            </span>
          )}
        </div>

        <Link
          href={`/restaurants/${r.slug}`}
          onClick={onNavigate}
          className="mt-4 flex items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90"
        >
          View full page
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
