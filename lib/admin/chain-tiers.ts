/**
 * Chain discovery TIER ORDERING (patch 0068) — the spine that both the single-venue
 * "Build roster" route and the bulk "Discover all locations" console share, so they can
 * never diverge on which source wins.
 *
 * THE RULE (0049/0051 no-invented-facts, applied to *whether a branch exists*): a model's
 * web-research branch list is a HINT / cross-check, NEVER the authoritative source and
 * NEVER a pre-empt of a real tier. Authority order, highest first:
 *   1. own feed  — the chain's OWN site (fetch crawl) + the render engine reading its
 *                  own locator feed (Olo/Yext/…). Trustworthy → seeded ungated.
 *   2. provider  — OpenStreetMap/Overpass + Google Places. Real records with ids, but
 *                  third-party → seeded GATED (needs_attention).
 *   3. web hint  — Grok's "list all locations". Last resort only, and always GATED.
 *
 * A handful of Grok snippets must never beat ~76 real OSM/Places records — so the render
 * engine and provider tiers gate on the CRAWL being empty, not on the crawl∪web union,
 * and when a real tier fires its result is used ALONE (the web guesses are demoted, not
 * merged). The one exception preserving the 2Fifty fix: when the crawl DID find the
 * roster, a web-only branch it missed is kept as a GATED supplement, never dropped.
 */
import type { SeedLocation } from "@/lib/admin/chain-seed";

/** The gate reason stamped on every Grok web-research seed (0068). */
export const WEB_HINT_GATE_REASON =
  "Web-research result — verify (not from the chain's own site or a data provider).";

/** How a discovered location was found, from discoverChainLocations. */
export type FoundVia = "crawl" | "web" | "both";

/** The subset of a DiscoveredLocation the tier selector needs. */
export interface DiscoveredLike {
  name?: string | null;
  location_label?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  source_url?: string | null;
  found_via?: FoundVia;
}

/** Map a discovered location to a SeedLocation (Part A: the label becomes the name;
 *  seedChainLocations rewrites the row name to the brand). Optionally stamp a gate. */
export function toSeed(l: DiscoveredLike, opts?: { gate_reason?: string }): SeedLocation {
  return {
    name: l.location_label ?? l.name ?? null,
    address: l.address ?? null,
    city: l.city ?? null,
    region: l.region ?? null,
    postcode: l.postcode ?? null,
    country: l.country ?? null,
    source_url: l.source_url ?? null,
    ...(opts?.gate_reason ? { gate_reason: opts.gate_reason } : {}),
  };
}

/** Locations the crawl read from the chain's OWN site (crawl or both) — authoritative. */
export function crawlOwnFeed(locations: DiscoveredLike[]): DiscoveredLike[] {
  return locations.filter((l) => (l.found_via ?? "crawl") !== "web");
}

/** Locations ONLY a model's web pass surfaced — a hint, gated. */
export function webOnly(locations: DiscoveredLike[]): DiscoveredLike[] {
  return locations.filter((l) => l.found_via === "web");
}

export type ChainTier = "engine" | "provider" | "own_feed" | "web" | "none";

export interface SelectInput {
  /** Own-site crawl seeds (ungated). */
  crawlSeeds: SeedLocation[];
  /** Grok web-only seeds (WILL be gated here). */
  webSeeds: SeedLocation[];
  /** Render-engine seeds (own locator feed; ungated). Empty unless the engine ran. */
  engineSeeds: SeedLocation[];
  /** Provider seeds (already carry provider_refs → gated downstream). */
  providerSeeds: SeedLocation[];
  /** Operator forced the provider tier ("Roster from providers"). */
  forceProviders: boolean;
}

export interface SelectResult {
  seeds: SeedLocation[];
  tier: ChainTier;
  /** True when the ONLY thing rostered is Grok web hits (all gated) — a loud signal. */
  webFallback: boolean;
  /** Web-only branches demoted below a real tier (recorded, not silently dropped). */
  demotedWeb: number;
}

/**
 * Pick the authoritative seed set per the tier order. PURE — unit-tested. The network
 * tiers (engine/provider) are run by the caller against the crawl-empty gate; this
 * decides what actually gets rostered and stamps the Grok web hint gate.
 */
export function selectChainSeeds(input: SelectInput): SelectResult {
  const webGated = input.webSeeds.map((s) => ({ ...s, gate_reason: s.gate_reason ?? WEB_HINT_GATE_REASON }));

  // Forced: provider records only. Grok guesses are demoted wholesale.
  if (input.forceProviders) {
    return {
      seeds: input.providerSeeds,
      tier: input.providerSeeds.length ? "provider" : "none",
      webFallback: false,
      demotedWeb: input.webSeeds.length,
    };
  }
  // A real tier fired → use it ALONE; the web guesses never merge in or outrank it.
  if (input.engineSeeds.length) {
    return { seeds: input.engineSeeds, tier: "engine", webFallback: false, demotedWeb: input.webSeeds.length };
  }
  if (input.providerSeeds.length) {
    return { seeds: input.providerSeeds, tier: "provider", webFallback: false, demotedWeb: input.webSeeds.length };
  }
  // Own-site crawl found the roster → keep it, plus any web-only branch it missed as a
  // GATED supplement (the 2Fifty fix — never drop a real find, never trust it unseen).
  if (input.crawlSeeds.length) {
    return { seeds: [...input.crawlSeeds, ...webGated], tier: "own_feed", webFallback: false, demotedWeb: 0 };
  }
  // Last resort: nothing but Grok web hits — all gated, loudly flagged.
  return { seeds: webGated, tier: webGated.length ? "web" : "none", webFallback: webGated.length > 0, demotedWeb: 0 };
}
