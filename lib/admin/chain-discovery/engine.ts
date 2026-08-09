/**
 * Chain-discovery orchestrator (Part 1, §2) — GENERAL, no per-chain logic.
 * Given a resolved website + brand, it finds the locator, detects the source
 * type at runtime, parses the REAL DOM/JSON (never readability), follows a
 * hierarchical index when needed, anchors the country from the chain itself,
 * enforces the no-invented-branch guard, dedupes, and returns the full list.
 * There is NO cap.
 *
 * Site resolution (which needs Grok/search) is done by the caller and passed in;
 * this module only touches the chain's own pages.
 */
import { Crawler } from "./fetch";
import {
  parseJsonLd,
  parseInlineJson,
  parseFlatDom,
  findLocatorLinks,
  findChildLocatorLinks,
  looksFlat,
} from "./parse";
import { anchorCountry } from "./country";
import { hasStreetAddress, isNotOpen, normalize, streetKey, type RawCandidate, type NormalLocation } from "./normalize";

export type SourceType = "jsonld" | "jsonapi" | "flat" | "hierarchical" | "none";

export interface DiscoveryResult {
  website: string;
  locatorUrl: string | null;
  sourceType: SourceType;
  country: string | null;
  locations: NormalLocation[];
  notes: string[];
  partial: boolean;
  pagesFetched: number;
  skippedNoStreet: number;
  skippedNotOpen: number;
}

const COMMON_LOCATOR_PATHS = [
  "/locations", "/locations/all", "/locations-and-menu", "/our-locations",
  "/stores", "/store-locator", "/find", "/find-a-location", "/find-us",
  "/where-to-eat", "/restaurants", "/visit", "/menu-locations",
];

interface ParseOut {
  candidates: RawCandidate[];
  childLinks: string[];
  sourceType: SourceType;
}

/** Detect the source type of a single page and parse it (§2, try in order). */
function parsePage(html: string, url: string): ParseOut {
  const ld = parseJsonLd(html, url);
  if (looksFlat(ld)) return { candidates: ld, childLinks: [], sourceType: "jsonld" };

  const inline = parseInlineJson(html, url);
  if (looksFlat(inline)) return { candidates: inline, childLinks: [], sourceType: "jsonapi" };

  const flat = parseFlatDom(html, url);
  if (looksFlat(flat)) return { candidates: flat, childLinks: [], sourceType: "flat" };

  // Not a flat list. Keep any single leaf address found here, and expose child
  // gateway links so the caller can crawl the hierarchy down to the leaves.
  const single = [...ld, ...inline, ...flat].filter((c) => hasStreetAddress(c));
  const childLinks = findChildLocatorLinks(html, url);
  return { candidates: single, childLinks, sourceType: "hierarchical" };
}

/** Resolve the locator page: nav/footer links first, then common paths. */
async function resolveLocator(
  crawler: Crawler,
  website: string
): Promise<{ url: string; html: string; parsed: ParseOut } | null> {
  const home = await crawler.get(website);
  const fromNav = home ? findLocatorLinks(home, website) : [];
  const fromPaths = COMMON_LOCATOR_PATHS.map((p) => {
    try { return new URL(p, website).toString(); } catch { return null; }
  }).filter((u): u is string => Boolean(u));

  // Prefer nav links (the site's own wording), then common-path probes.
  const tried = new Set<string>();
  for (const url of [...fromNav, ...fromPaths]) {
    if (tried.has(url)) continue;
    tried.add(url);
    const html = await crawler.get(url);
    if (!html) continue;
    const parsed = parsePage(html, url);
    if (parsed.candidates.length > 0 || parsed.childLinks.length > 0) {
      return { url, html, parsed };
    }
  }
  return null;
}

export async function discoverChain(opts: {
  website: string;
  brand: string;
  country?: string | null;
  deadlineMs?: number; // wall-clock budget; on hit, returns partial
  crawler?: Crawler;
}): Promise<DiscoveryResult> {
  const start = Date.now();
  const deadline = start + (opts.deadlineMs ?? 240_000);
  const crawler = opts.crawler ?? new Crawler();
  const notes: string[] = [];

  let host = "";
  try { host = new URL(opts.website).host; } catch { /* invalid */ }

  const chosen = await resolveLocator(crawler, opts.website);
  if (!chosen) {
    return {
      website: opts.website, locatorUrl: null, sourceType: "none", country: opts.country ?? null,
      locations: [], notes: ["No locator page found on the site."], partial: false,
      pagesFetched: crawler.fetched, skippedNoStreet: 0, skippedNotOpen: 0,
    };
  }

  const all: RawCandidate[] = [...chosen.parsed.candidates];
  const sourceType = chosen.parsed.sourceType;
  let partial = false;

  // Hierarchical: BFS through gateway links to the leaves.
  if (chosen.parsed.sourceType === "hierarchical" && chosen.parsed.childLinks.length) {
    const visited = new Set<string>([chosen.url]);
    const frontier = chosen.parsed.childLinks.filter((u) => !visited.has(u));
    frontier.forEach((u) => visited.add(u));
    const conc = 4;
    while (frontier.length) {
      if (Date.now() > deadline) { partial = true; notes.push("Crawl hit the time budget — partial result; re-run to continue."); break; }
      const batch = frontier.splice(0, conc);
      const pages = await Promise.all(batch.map((u) => crawler.get(u).then((h) => ({ u, h }))));
      for (const { u, h } of pages) {
        if (!h) continue;
        const p = parsePage(h, u);
        all.push(...p.candidates);
        for (const cl of p.childLinks) {
          if (!visited.has(cl)) { visited.add(cl); frontier.push(cl); }
        }
      }
    }
  }

  // Anchor the country from the chain (TLD → addresses). Never default to US.
  const country = anchorCountry(host, all.map((c) => c.address ?? [c.street, c.city, c.region, c.postcode].filter(Boolean).join(", ")))
    ?? (opts.country ?? null);
  if (!country) notes.push("Could not anchor a country from the site or addresses — branches flagged for review.");

  // Normalise → filter (no invented branches; skip coming-soon/closed) → dedupe.
  const seen = new Set<string>();
  const out: NormalLocation[] = [];
  let skippedNoStreet = 0;
  let skippedNotOpen = 0;
  for (const c of all) {
    if (isNotOpen(c)) { skippedNotOpen++; continue; }
    if (!hasStreetAddress(c)) { skippedNoStreet++; continue; }
    const n = normalize(c, country);
    const key = `${streetKey(n.street) || n.address.toLowerCase()}|${(n.city ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }

  if (skippedNoStreet) notes.push(`${skippedNoStreet} candidate(s) had no verifiable street address and were not seeded.`);
  if (skippedNotOpen) notes.push(`${skippedNotOpen} coming-soon/closed listing(s) were skipped.`);

  return {
    website: opts.website,
    locatorUrl: chosen.url,
    sourceType,
    country,
    locations: out,
    notes,
    partial,
    pagesFetched: crawler.fetched,
    skippedNoStreet,
    skippedNotOpen,
  };
}
