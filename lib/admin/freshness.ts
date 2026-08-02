export type Fresh = "green" | "amber" | "red";

/**
 * THE ONE freshness rule (by `enriched_at` age). Tune these two numbers and the
 * Listings badge, the freshness filter, and the dashboard tiles all move together.
 *   green : enriched within `greenMaxDays`
 *   amber : older than green but within `amberMaxDays`
 *   red   : older than `amberMaxDays`, OR never enriched
 * (permanently_closed and needs_attention are SEPARATE states — not on this scale.)
 */
export const FRESHNESS_DAYS = { greenMaxDays: 30, amberMaxDays: 90 } as const;

/** Classify an enriched_at into a colour by the one rule above. */
export function freshnessTone(enrichedAt: string | null | undefined): Fresh {
  if (!enrichedAt) return "red";
  const days = Math.floor((Date.now() - new Date(enrichedAt).getTime()) / 86_400_000);
  if (days <= FRESHNESS_DAYS.greenMaxDays) return "green";
  if (days <= FRESHNESS_DAYS.amberMaxDays) return "amber";
  return "red";
}

/** Traffic-light on enrichment age, with a human label + day count. */
export function freshness(enrichedAt: string | null | undefined): {
  tone: Fresh;
  label: string;
  days: number | null;
} {
  if (!enrichedAt) return { tone: "red", label: "Never", days: null };
  const days = Math.floor((Date.now() - new Date(enrichedAt).getTime()) / 86_400_000);
  const label =
    days < 1 ? "Today" : days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
  return { tone: freshnessTone(enrichedAt), label, days };
}

export const FRESH_TONE_CLASSES: Record<Fresh, string> = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};
export const FRESH_DOT: Record<Fresh, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
};
