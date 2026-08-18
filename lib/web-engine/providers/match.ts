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

/**
 * Normalize a name to a brand-IDENTITY key for an EXACT match (patch 0073). Unlike
 * `sharesBrand` (a deliberately loose token/substring guard), this is the strict
 * identity used to ACCEPT a provider result as a real branch. It lowercases, drops
 * ®/™, unifies every BBQ spelling (barbeque / barbecue / bar-b-q / bar-b-que / b-b-q
 * → "bbq"), strips punctuation, and collapses whitespace. So "City Barbeque",
 * "City Barbecue", "City Bar-B-Que" and "City BBQ" all normalize to "city bbq".
 */
export function brandIdentityKey(name: string | null | undefined): string {
  if (!name) return "";
  let t = ` ${name.toLowerCase()} `;
  t = t.replace(/[®™]/g, " ");
  t = t.replace(/[^a-z0-9]+/g, " ");             // punctuation → space (bar-b-que → "bar b que")
  t = ` ${t.trim()} `;
  t = t.replace(/\bbarbe[qc]ue\b/g, " bbq ");    // barbeque / barbecue
  t = t.replace(/\bbar b q(?:ue)?\b/g, " bbq "); // "bar b q" / "bar b que"
  t = t.replace(/\bbar b cue\b/g, " bbq ");
  t = t.replace(/\bb b q\b/g, " bbq ");          // "b b q"
  return t.replace(/\s+/g, " ").trim();
}

/**
 * STRICT brand-identity gate (patch 0073). True ONLY when the candidate's own name,
 * normalized, EQUALS the chain's canonical name — never a loose/partial/substring
 * match. This is what a provider result must pass to become a branch.
 *
 * Why it exists: a state-by-state Places text search for a GENERIC brand phrase
 * ("City Barbeque") returns loosely-related BBQ places in every region, and
 * `sharesBrand` let them through because the distinctive token of "City Barbeque"
 * collapses to just "city" — which matches "Park City BBQ", "Salt Lake City …",
 * "City BBQ Express", etc. Exact identity rejects those while still accepting real
 * "City Barbeque" / "City BBQ" outlets. An empty/blank candidate never matches.
 */
export function matchesBrandIdentity(candidate: string | null | undefined, brand: string): boolean {
  const c = brandIdentityKey(candidate);
  const b = brandIdentityKey(brand);
  return b.length > 0 && c === b;
}
