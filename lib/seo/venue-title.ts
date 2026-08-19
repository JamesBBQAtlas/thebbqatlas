/**
 * Chain-branch title differentiation for SEO (Build note, 19 Aug 2026). Hundreds of
 * chain-branch pages (Mission BBQ, City Barbeque, …) shared ONE `<title>`/`og:title`/
 * `<h1>` — just the brand — which reads as near-duplicate to Google and stalls
 * indexation. For a chain BRANCH (a venue with a `chain_parent_id`) we inject the
 * locality so every branch is distinct.
 *
 * This is a RENDER-TIME TEMPLATE RULE, not a data edit: it's computed from the venue's
 * `chain_parent_id` + `city`/`region` on every page render, so it applies automatically
 * to every branch live today AND every chain rostered in the future — no backfill, no
 * per-chain work. Pure + dependency-free.
 */

export interface TitleVenue {
  name: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  chain_parent_id?: string | null;
}

/** Is this a chain BRANCH (attached under a flagship), i.e. one of many near-identical
 *  pages that needs its city to differentiate it? */
export function isChainBranch(v: Pick<TitleVenue, "chain_parent_id">): boolean {
  return Boolean(v.chain_parent_id);
}

/** The locality label for a title. With region (state/province) when it's present and
 *  not just a repeat of the city ("Acworth, GA"); otherwise the bare city ("Acworth"). */
export function venueLocality(v: TitleVenue, opts?: { withRegion?: boolean }): string | null {
  const city = (v.city ?? "").trim();
  if (!city) return null;
  const region = (v.region ?? "").trim();
  if (opts?.withRegion && region && region.toLowerCase() !== city.toLowerCase()) {
    return `${city}, ${region}`;
  }
  return city;
}

/**
 * The `<title>` / `og:title` base string. A chain branch becomes "Brand — City, Region";
 * a single-location venue keeps its (already-unique) name unchanged. The site's
 * `%s | The BBQ Atlas` template still appends the site name to the document title.
 */
export function venueDisplayTitle(v: TitleVenue): string {
  if (!isChainBranch(v)) return v.name;
  const loc = venueLocality(v, { withRegion: true });
  return loc ? `${v.name} — ${loc}` : v.name;
}

/** The `<h1>` string — same rule but city only (no region), per the note. */
export function venueH1(v: TitleVenue): string {
  if (!isChainBranch(v)) return v.name;
  const loc = venueLocality(v, { withRegion: false });
  return loc ? `${v.name} — ${loc}` : v.name;
}
