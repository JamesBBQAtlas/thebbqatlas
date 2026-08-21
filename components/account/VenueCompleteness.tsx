import { Check, Circle, Lock } from "lucide-react";
import { looksLikeSeedStub } from "@/lib/admin/seed-copy";

type CompletenessVenue = {
  description: string | null;
  hours: Record<string, string> | null;
  website: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  hero_image_url: string | null;
  shop_url: string | null;
  order_url: string | null;
  tickets_url: string | null;
  gift_card_url: string | null;
};

/**
 * Tier 3 — the completeness meter + guided checklist on the owner dashboard. Shown to FREE
 * owners too (it's the mechanic that turns a claim into the photos/links we want, and it
 * nudges the Pro upgrade with the two Pro-gated items). Purely presentational; the server
 * still enforces every gate.
 */
export function VenueCompleteness({
  venue,
  photoCount,
  hasControl,
}: {
  venue: CompletenessVenue;
  photoCount: number;
  hasControl: boolean;
}) {
  const hasDescription = Boolean(venue.description && !looksLikeSeedStub(venue.description));
  const hasHours = Boolean(
    venue.hours && Object.values(venue.hours).some((h) => (h ?? "").trim())
  );
  const hasLinks = Boolean(
    venue.website ||
      venue.instagram_url ||
      venue.x_url ||
      venue.facebook_url ||
      venue.tiktok_url ||
      venue.youtube_url
  );
  const hasPhotos = photoCount >= 3;
  const hasHero = Boolean(venue.hero_image_url && venue.hero_image_url.trim());
  const hasOwnerLinks = Boolean(
    venue.shop_url || venue.order_url || venue.tickets_url || venue.gift_card_url
  );

  const morePhotos = Math.max(0, 3 - photoCount);
  const items = [
    { key: "desc", label: "Write your description", done: hasDescription, pro: false },
    { key: "hours", label: "Add your opening hours", done: hasHours, pro: false },
    { key: "links", label: "Add your website & socials", done: hasLinks, pro: false },
    {
      key: "photos",
      label: hasPhotos
        ? "Add photos"
        : `Add ${morePhotos} more photo${morePhotos === 1 ? "" : "s"}`,
      done: hasPhotos,
      pro: false,
    },
    { key: "hero", label: "Choose your hero image", done: hasHero, pro: true },
    {
      key: "ownerlinks",
      label: "Add your owner links (shop, order, tickets, gift cards)",
      done: hasOwnerLinks,
      pro: true,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <div className="mb-5 rounded-lg border border-border-subtle bg-surface-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">
          Your page is {pct}% complete
        </span>
        <span className="text-xs text-text-muted">
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-0">
        <div
          className="h-full rounded-full bg-brand-gold transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-sm">
            {i.done ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : i.pro && !hasControl ? (
              <Lock className="h-4 w-4 shrink-0 text-brand-gold" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-text-muted" />
            )}
            <span className={i.done ? "text-text-muted line-through" : "text-text-secondary"}>
              {i.label}
              {i.pro && !i.done && !hasControl && (
                <span className="ml-1.5 text-xs font-semibold text-brand-gold">Pro</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {pct < 100 && (
        <p className="mt-3 text-xs text-text-muted">
          A complete page gets found and chosen more often.
          {!hasControl ? " Hero control and owner links unlock with Pro." : ""}
        </p>
      )}
    </div>
  );
}
