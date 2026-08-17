/**
 * Provider-tier brand matching (patch 0061) — a small, DEPENDENCY-FREE mirror of the
 * roster brand tokeniser (lib/admin/chain-seed `brandTokens`). It lives here, not
 * imported from chain-seed, on purpose: the provider adapters must stay pure so they
 * unit-test without pulling the Supabase/geocoder graph. Same intent — drop the
 * generic BBQ/company words, compare on the distinctive tokens — so a provider query
 * that regex-over-matches ("City Barbeque" also returning "Old City Barbecue Co") is
 * filtered to the actual chain before anything is seeded.
 *
 * This is a GUARD, never the identity: physical-location dedupe still keys on
 * `normStreet` downstream. It only decides "is this row plausibly the same brand".
 */

/** Generic BBQ / company / type words that carry no brand identity (mirror of the
 *  roster BRAND_STOP set). */
const BRAND_STOP = new Set([
  "bbq", "barbecue", "barbeque", "barbq", "bar", "b", "que", "q", "co", "company",
  "inc", "llc", "ltd", "the", "and", "grill", "grille", "smokehouse", "smoke",
  "house", "restaurant", "kitchen", "pit", "pits", "joint", "brothers", "bros",
]);

/** The distinctive lowercase tokens of a name, longest-first, apostrophes dropped
 *  WITHOUT splitting ("Jack's" → "jacks"), generic words removed. */
export function brandKeyTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !BRAND_STOP.has(w))
    .sort((a, b) => b.length - a.length);
}

/** The single strongest (longest) distinctive token of a brand. */
export function brandKeyToken(brand: string): string {
  return brandKeyTokens(brand)[0] ?? "";
}

/**
 * Does `candidate` (a provider record's brand/name) plausibly belong to `brand`?
 * True when they share a distinctive token, or the candidate contains the brand's
 * strongest token as a substring ("City Barbeque Dublin" ⊇ "city"). A brand whose
 * strongest token is too weak (< 3 chars) to judge is treated as a match rather than
 * risk dropping a real branch — the physical-location gate + human review catch a
 * stray. An empty candidate never matches (a provider row with no brand/name at all
 * can't be attributed to the chain).
 */
export function sharesBrand(candidate: string | null | undefined, brand: string): boolean {
  const parentTok = brandKeyToken(brand);
  if (parentTok.length < 3) return true; // too weak to judge — don't over-filter
  const cand = (candidate ?? "").trim();
  if (!cand) return false;
  const candToks = brandKeyTokens(cand);
  const brandToks = new Set(brandKeyTokens(brand));
  if (candToks.some((t) => brandToks.has(t))) return true;
  const candNorm = cand.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return candNorm.includes(parentTok);
}
