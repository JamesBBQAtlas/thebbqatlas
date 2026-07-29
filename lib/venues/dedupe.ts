/**
 * The ONE duplicate-venue matching standard. Reused everywhere a venue can
 * enter the system: the public Submit form, the moderation queue, the bulk
 * import, and (originally) the chain-roster dedupe. Same normalizers as the
 * §09.2 chain dedupe (lib/admin/address.ts) — promoted here to a shared module.
 *
 * A candidate is a possible duplicate of an existing venue if ANY of:
 *   - same normalized STREET address;
 *   - within ~100 m of an existing venue's lat/lng;
 *   - fuzzy name similarity AND same normalized city.
 * We WARN, never silently reject — legitimate different venues can share an
 * address (food halls, shared buildings), so a human stays in the loop. Only
 * high-confidence exact matches are auto-skipped on import (and still reported).
 */
import { normStreet, normCity } from "@/lib/admin/address";
import { haversineKm } from "@/lib/utils/geo";

export interface VenueLike {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  chain_parent_id?: string | null;
}

export type DupConfidence = "high" | "medium";

export interface DuplicateMatch {
  id: string;
  name: string;
  city: string | null;
  slug: string | null;
  reason: string; // "same address" · "82 m away" · "name match, same city"
  confidence: DupConfidence;
  score: number; // 0..1, for ranking
  meters?: number;
}

const GEO_HIGH_M = 35; // essentially the same point
const GEO_MAX_M = 100; // "close enough to check"
const NAME_MIN = 0.82; // fuzzy threshold to bother flagging
const NAME_HIGH = 0.9; // fuzzy threshold for high confidence

/** Generic words dropped before comparing names, so "Franklin BBQ" ≈ "Franklin Barbecue". */
const GENERIC = new Set([
  "the",
  "bbq",
  "barbecue",
  "barbeque",
  "bar-b-que",
  "bar-b-q",
  "smokehouse",
  "smoke",
  "house",
  "restaurant",
  "co",
  "company",
  "grill",
  "grille",
  "kitchen",
  "and",
]);

/** Normalise a venue name for fuzzy comparison. */
export function normName(name?: string | null): string {
  const base = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  const kept = base.split(" ").filter((w) => w && !GENERIC.has(w));
  // If we stripped everything (e.g. name was literally "The BBQ"), keep the base.
  return (kept.length ? kept : base.split(" ")).join(" ");
}

/** Character-bigram Dice coefficient — robust similarity for short venue names. */
export function nameSimilarity(a: string, b: string): number {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ax = bigrams(x);
  const bx = bigrams(y);
  let overlap = 0;
  for (const [g, n] of ax) {
    const m = bx.get(g);
    if (m) overlap += Math.min(n, m);
  }
  const total = x.length - 1 + (y.length - 1);
  return (2 * overlap) / total;
}

const validCoord = (v: VenueLike): boolean =>
  typeof v.lat === "number" &&
  typeof v.lng === "number" &&
  Number.isFinite(v.lat) &&
  Number.isFinite(v.lng) &&
  !(v.lat === 0 && v.lng === 0);

/**
 * Rank the existing venues that a candidate might duplicate. Degrades
 * gracefully: with no address/geo it falls back to name + city. Same-brand
 * venues in DIFFERENT cities never match (that's a new chain branch, not a
 * duplicate) because the name path requires the same city.
 */
export function findDuplicates(
  candidate: VenueLike,
  existing: VenueLike[],
  limit = 5
): DuplicateMatch[] {
  const candStreet = normStreet(candidate.address);
  const candCity = normCity(candidate.city);
  const candName = normName(candidate.name);
  const candGeo = validCoord(candidate);

  const out: DuplicateMatch[] = [];
  for (const ex of existing) {
    if (!ex.id) continue;
    if (candidate.id && ex.id === candidate.id) continue; // never match self

    let best: { reason: string; confidence: DupConfidence; score: number; meters?: number } | null =
      null;
    const consider = (c: { reason: string; confidence: DupConfidence; score: number; meters?: number }) => {
      if (!best || c.score > best.score) best = c;
    };

    // 1) Same normalized street address.
    const exStreet = normStreet(ex.address);
    if (candStreet && exStreet && candStreet === exStreet) {
      consider({ reason: "same address", confidence: "high", score: 0.97 });
    }

    // 2) Geo proximity.
    if (candGeo && validCoord(ex)) {
      const meters = haversineKm(candidate.lat!, candidate.lng!, ex.lat!, ex.lng!) * 1000;
      if (meters <= GEO_MAX_M) {
        const confidence: DupConfidence = meters <= GEO_HIGH_M ? "high" : "medium";
        // Closer → higher score (0.99 at 0 m, ~0.80 at 100 m).
        const score = Math.max(0.8, 0.99 - (meters / GEO_MAX_M) * 0.19);
        consider({ reason: `${Math.round(meters)} m away`, confidence, score, meters });
      }
    }

    // 3) Fuzzy name + SAME city.
    const exCity = normCity(ex.city);
    if (candName && candCity && exCity && candCity === exCity) {
      const sim = nameSimilarity(candName, normName(ex.name));
      if (sim >= NAME_MIN) {
        const confidence: DupConfidence = sim >= NAME_HIGH ? "high" : "medium";
        consider({ reason: "name match, same city", confidence, score: Math.min(0.96, sim) });
      }
    }

    if (best) {
      const b = best as { reason: string; confidence: DupConfidence; score: number; meters?: number };
      out.push({
        id: ex.id,
        name: ex.name ?? "Unknown venue",
        city: ex.city ?? null,
        slug: ex.slug ?? null,
        reason: b.reason,
        confidence: b.confidence,
        score: b.score,
        meters: b.meters,
      });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** True if the candidate has a high-confidence match (safe to auto-skip on import). */
export function hasHighConfidence(matches: DuplicateMatch[]): boolean {
  return matches.some((m) => m.confidence === "high");
}
