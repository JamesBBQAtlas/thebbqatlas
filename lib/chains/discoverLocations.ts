import "server-only";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { discoverChain as webDiscover, type VenueLead } from "@/lib/ai/enrich";
import { discoverChain as crawlDiscover } from "@/lib/admin/chain-discovery/engine";
import { streetKey } from "@/lib/admin/chain-discovery/normalize";
import { Crawler } from "@/lib/admin/chain-discovery/fetch";
import { grokCost, round4 } from "@/lib/ai/cost";

/**
 * THE one chain-discovery module (chain-roster fix). Both entry points — the
 * single-venue "Build roster" and the bulk "Discover all locations" — call THIS,
 * so they can never diverge again (that divergence is exactly how a chain got
 * found by the bulk tool but missed by the single one).
 *
 * It runs BOTH discovery sources and UNIONS them:
 *   • the site CRAWLER (lib/admin/chain-discovery/engine) — reads the chain's own
 *     pages (locator index, JSON-LD, per-location pages, visible-text sweep). Free,
 *     deterministic, leaves a real crawl trail; but blind to JS-rendered content.
 *   • the WEB pass (Grok) — web-searches the brand's own site + socials + press to
 *     find locations the crawler can't see (JS-injected addresses, per-location
 *     pages, or locations only listed off-site). Costs a Grok search.
 * The union is deduped by street+city, so a branch found by both counts once and
 * a branch found by only one is still rostered. Neither source alone is trusted to
 * be complete — that redundancy is the point.
 */

export interface DiscoveredLocation {
  name: string | null;
  location_label: string | null;
  address: string | null; // street line (crawl) or full address (web)
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  hours: Record<string, string> | null;
  instagram_url: string | null;
  source_url: string | null;
  found_via: "crawl" | "web" | "both";
}

export interface DiscoverOutcome {
  locations: DiscoveredLocation[];
  lowConfidence: { address: string | null; reason: string }[];
  crawledUrls: string[];
  rawAddresses: string[];
  sourceTypes: string[]; // e.g. ["crawl:hierarchical", "web"]
  notes: string[];
  partial: boolean;
  pagesFetched: number;
  country: string | null;
  /** The chain's own store-locator index URL, if the crawl resolved one. */
  locatorUrl: string | null;
  /** Brand-level facts from the web pass, for the bulk create + parent enrich. */
  brand: {
    name: string | null;
    description: string | null;
    website: string | null;
    style: string | null;
    instagram_url: string | null;
    x_url: string | null;
    facebook_url: string | null;
    tiktok_url: string | null;
    youtube_url: string | null;
  } | null;
  isChain: boolean;
  confidence: number;
  reviewerNotes: string | null;
  // For the AI spend ledger (web pass only — the crawl is free).
  usage: { in_tokens: number; out_tokens: number; searches: number } | null;
  model: string | null;
  cost: number;
  ranWeb: boolean;
  ranCrawl: boolean;
}

/** Stable dedupe key: leading street token + city, lower-cased. */
export function locationKey(l: { address: string | null; city: string | null }): string {
  const lead = (l.address ?? "").split(",")[0] ?? "";
  return `${streetKey(lead) || lead.trim().toLowerCase()}|${(l.city ?? "").trim().toLowerCase()}`;
}

/** True when a location carries a real street line (a building number + words). */
export function hasStreet(l: { address: string | null }): boolean {
  const lead = (l.address ?? "").split(",")[0]?.trim() ?? "";
  return /\d/.test(lead) && lead.length >= 4;
}

/**
 * Union two discovered lists, deduped by street+city. Fills missing fields from
 * the other source (so a web hit with no region/postcode gains the crawl's, and
 * vice-versa) and marks a location found by both as `found_via: "both"`. Pure —
 * unit-tested. `primary` is listed first (web is the bulk tool's reference).
 */
export function mergeDiscovered(
  primary: DiscoveredLocation[],
  secondary: DiscoveredLocation[]
): DiscoveredLocation[] {
  const byKey = new Map<string, DiscoveredLocation>();
  const add = (l: DiscoveredLocation) => {
    if (!hasStreet(l)) return; // never roster a location with no street
    const key = locationKey(l);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...l });
      return;
    }
    // Merge: keep existing, fill any null string field from the incoming one.
    for (const f of ["name", "location_label", "address", "city", "region", "postcode", "country", "phone", "instagram_url", "source_url"] as const) {
      if (!existing[f] && l[f]) (existing[f] as string | null) = l[f];
    }
    // Hours is an object, not a string — fill it on its own.
    if (!existing.hours && l.hours) existing.hours = l.hours;
    if (existing.found_via !== l.found_via) existing.found_via = "both";
  };
  for (const l of primary) add(l);
  for (const l of secondary) add(l);
  return [...byKey.values()];
}

/** The web-discovery signature — the real one is Grok; tests inject a fake. */
export type WebDiscoverFn = typeof webDiscover;

export async function discoverChainLocations(opts: {
  lead: VenueLead;
  website?: string | null;
  brand: string;
  country?: string | null;
  deadlineMs?: number;
  useWeb?: boolean;
  useCrawl?: boolean;
  crawler?: Crawler; // injectable for tests
  webFn?: WebDiscoverFn; // injectable for tests (defaults to the real Grok pass)
}): Promise<DiscoverOutcome> {
  const website = (opts.website ?? opts.lead.website ?? "").trim() || null;
  const useWeb = opts.useWeb ?? GROK_ENABLED;
  const useCrawl = opts.useCrawl ?? Boolean(website);
  const webFn = opts.webFn ?? webDiscover;

  // Run both sources concurrently; a failure in one must not kill the other —
  // redundancy is the whole point.
  const [crawlRes, webRes] = await Promise.allSettled([
    useCrawl && website
      ? crawlDiscover({ website, brand: opts.brand, country: opts.country ?? null, deadlineMs: opts.deadlineMs, crawler: opts.crawler })
      : Promise.resolve(null),
    useWeb
      ? webFn({ ...opts.lead, website: website ?? opts.lead.website, name: opts.lead.name ?? opts.brand })
      : Promise.resolve(null),
  ]);

  const crawl = crawlRes.status === "fulfilled" ? crawlRes.value : null;
  const web = webRes.status === "fulfilled" ? webRes.value : null;

  const notes: string[] = [];
  if (crawlRes.status === "rejected") notes.push("Site crawl failed — relied on web results only.");
  if (webRes.status === "rejected") notes.push("Web discovery failed — relied on the site crawl only.");

  const crawlLocs: DiscoveredLocation[] = (crawl?.locations ?? []).map((l) => ({
    name: null,
    location_label: l.location_label,
    address: l.street ?? l.address ?? null,
    city: l.city,
    region: l.region,
    postcode: l.postcode,
    country: l.country,
    phone: l.phone,
    hours: null,
    instagram_url: null,
    source_url: l.source_url,
    found_via: "crawl",
  }));

  const webLocs: DiscoveredLocation[] = (web?.locations ?? []).map((l) => ({
    name: l.name,
    location_label: l.location_label,
    address: l.address,
    city: l.city,
    region: null,
    postcode: null,
    country: l.country,
    phone: l.phone,
    hours: l.hours ?? null,
    instagram_url: l.instagram_url,
    source_url: null,
    found_via: "web",
  }));

  // Web is the bulk tool's reference → listed first; the crawl unions in.
  const locations = mergeDiscovered(webLocs, crawlLocs);

  const sourceTypes: string[] = [];
  if (crawl && crawl.sourceType !== "none" && crawlLocs.length) sourceTypes.push(`crawl:${crawl.sourceType}`);
  if (webLocs.length) sourceTypes.push("web");

  const crawledUrls = [
    ...new Set([...(crawl?.crawledUrls ?? []), ...((web?.citations as string[] | undefined) ?? [])]),
  ];
  const rawAddresses = [
    ...new Set([
      ...(crawl?.rawAddresses ?? []),
      ...webLocs.map((l) => l.address).filter((a): a is string => Boolean(a)),
    ]),
  ];

  const usage = web?.usage ?? null;
  const model = web?.model ?? null;
  const cost = usage && model ? round4(grokCost(usage, model)) : 0;

  return {
    locations,
    lowConfidence: (crawl?.lowConfidence ?? []).map((l) => ({ address: l.address, reason: l.reason })),
    crawledUrls,
    rawAddresses,
    sourceTypes,
    notes: [...notes, ...(crawl?.notes ?? [])],
    partial: Boolean(crawl?.partial),
    pagesFetched: crawl?.pagesFetched ?? 0,
    country: crawl?.country ?? opts.country ?? null,
    locatorUrl: crawl?.locatorUrl ?? null,
    brand: web
      ? {
          name: web.brand_name,
          description: web.description,
          website: web.website,
          style: web.style,
          instagram_url: web.instagram_url,
          x_url: web.x_url,
          facebook_url: web.facebook_url,
          tiktok_url: web.tiktok_url,
          youtube_url: web.youtube_url,
        }
      : null,
    isChain: Boolean(web?.is_chain) || locations.length > 1,
    confidence: web?.confidence ?? (locations.length ? 0.6 : 0),
    reviewerNotes: web?.reviewer_notes ?? null,
    usage,
    model,
    cost,
    ranWeb: Boolean(web),
    ranCrawl: Boolean(crawl),
  };
}
