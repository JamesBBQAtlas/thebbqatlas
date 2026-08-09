/**
 * Chain-discovery orchestrator (Part 1 §2, hardened by Part 4) — GENERAL, no
 * per-chain logic. Given a resolved website + brand, it:
 *   • finds the locator page (broad synonym list, not exact "Locations"), parses
 *     the REAL DOM/JSON, and follows a hierarchical index when needed; AND
 *   • is ADDRESS-DRIVEN — it also sweeps the homepage + common content pages +
 *     internal links and extracts every address from their VISIBLE TEXT, so a
 *     chain that lists both branches in plain text on its homepage (under a
 *     heading like "BBQ Near You!") with NO locator page is still discovered.
 * It anchors the country from the chain itself, enforces the no-invented-branch
 * guard, classifies HQ/shipping addresses OUT of the branch roster (surfaced as
 * low-confidence, never dropped), dedupes, and — crucially — is LOUD on failure:
 * it returns the exact URLs crawled and the raw address strings it saw so a
 * <2-branch result on a known chain can be explained, never a silent [].
 *
 * Site resolution (which needs Grok/search) is done by the caller and passed in;
 * this module only touches the chain's own pages. The crawl makes no LLM calls,
 * so under Part 4 its budget is wall-clock, not dollars.
 */
import { Crawler } from "./fetch";
import {
  parseJsonLd,
  parseInlineJson,
  parseFlatDom,
  parseVisibleText,
  findLocatorLinks,
  findChildLocatorLinks,
  looksFlat,
} from "./parse";
import { anchorCountry } from "./country";
import { classifyAddressType } from "./classify";
import { hasStreetAddress, isNotOpen, normalize, streetKey, type RawCandidate, type NormalLocation } from "./normalize";

export type SourceType = "jsonld" | "jsonapi" | "flat" | "hierarchical" | "text" | "none";

export interface DiscoveryResult {
  website: string;
  locatorUrl: string | null;
  sourceType: SourceType;
  country: string | null;
  /** Real dine-in branches (rostered). */
  locations: NormalLocation[];
  /** HQ / shipping / mail-order addresses — surfaced for confirmation, never rostered. */
  lowConfidence: (NormalLocation & { reason: string })[];
  notes: string[];
  partial: boolean;
  pagesFetched: number;
  skippedNoStreet: number;
  skippedNotOpen: number;
  /** Every URL we actually fetched — for the loud-on-failure report (Part 4B). */
  crawledUrls: string[];
  /** Every raw address string we saw (before filtering) — for the same report. */
  rawAddresses: string[];
}

const COMMON_LOCATOR_PATHS = [
  "/locations", "/locations/all", "/locations-and-menu", "/our-locations",
  "/stores", "/store-locator", "/find", "/find-a-location", "/find-us",
  "/where-to-eat", "/restaurants", "/visit", "/menu-locations",
];

// Part 4A — content pages that commonly carry addresses in plain text even when
// there is no locator page. Swept for visible-text addresses regardless of name.
const CONTENT_PATHS = [
  "/", "/about", "/about-us", "/our-story", "/contact", "/contact-us",
  "/visit", "/visit-us", "/hours", "/find-us", "/menu", "/catering",
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
  website: string,
  homeHtml: string | null
): Promise<{ url: string; html: string; parsed: ParseOut } | null> {
  const fromNav = homeHtml ? findLocatorLinks(homeHtml, website) : [];
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

/**
 * Part 4A — sweep the homepage + common content pages + the site's own nav/footer
 * links, pulling addresses out of each page's VISIBLE TEXT. This is what makes
 * discovery address-driven rather than page-driven. Bounded by the crawl budget.
 */
async function sweepVisibleText(
  crawler: Crawler,
  website: string,
  homeHtml: string | null,
  deadline: number
): Promise<{ candidates: RawCandidate[]; urls: string[] }> {
  const urls = new Set<string>();
  for (const p of CONTENT_PATHS) {
    try { urls.add(new URL(p, website).toString()); } catch { /* skip */ }
  }
  // The site's own nav/footer links (its own wording) — bounded.
  if (homeHtml) for (const u of findLocatorLinks(homeHtml, website).slice(0, 12)) urls.add(u);

  const candidates: RawCandidate[] = [];
  const fetchedUrls: string[] = [];
  // Homepage HTML we already have — parse it first without re-fetching.
  const home = website;
  if (homeHtml) {
    candidates.push(...parseVisibleText(homeHtml, home));
    fetchedUrls.push(home);
    urls.delete(home);
  }
  const list = [...urls];
  const conc = 4;
  for (let i = 0; i < list.length; i += conc) {
    if (Date.now() > deadline) break;
    const batch = list.slice(i, i + conc);
    const pages = await Promise.all(batch.map((u) => crawler.get(u).then((h) => ({ u, h }))));
    for (const { u, h } of pages) {
      if (!h) continue;
      fetchedUrls.push(u);
      candidates.push(...parseVisibleText(h, u));
    }
  }
  return { candidates, urls: fetchedUrls };
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
  const crawledUrls: string[] = [];

  let host = "";
  try { host = new URL(opts.website).host; } catch { /* invalid */ }

  // Fetch the homepage once — reused by both the locator resolver and the sweep.
  const homeHtml = await crawler.get(opts.website);
  if (homeHtml) crawledUrls.push(opts.website);

  const all: RawCandidate[] = [];
  let sourceType: SourceType = "none";
  let locatorUrl: string | null = null;
  let partial = false;

  // --- Structured locator (JSON-LD / store-locator JSON / flat DOM / crawl) ---
  const chosen = await resolveLocator(crawler, opts.website, homeHtml);
  if (chosen) {
    locatorUrl = chosen.url;
    sourceType = chosen.parsed.sourceType;
    crawledUrls.push(chosen.url);
    all.push(...chosen.parsed.candidates);

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
          crawledUrls.push(u);
          const p = parsePage(h, u);
          all.push(...p.candidates);
          for (const cl of p.childLinks) {
            if (!visited.has(cl)) { visited.add(cl); frontier.push(cl); }
          }
        }
      }
    }
  }

  // --- Part 4A — ALWAYS sweep visible text too (address-driven) --------------
  // Even with a locator, a footer/homepage may carry an address (or the shipping
  // HQ) the structured parse missed; without a locator this is the whole game.
  const sweepBudget = Math.min(deadline, start + Math.floor((opts.deadlineMs ?? 240_000) * 0.6));
  const sweep = await sweepVisibleText(crawler, opts.website, homeHtml, sweepBudget);
  all.push(...sweep.candidates);
  for (const u of sweep.urls) if (!crawledUrls.includes(u)) crawledUrls.push(u);
  if (!chosen && sweep.candidates.length) {
    sourceType = "text";
    notes.push("No structured locator — addresses read from the site's visible text.");
  }

  // Every raw address string we saw, for the loud-on-failure report (Part 4B).
  const rawAddresses = [
    ...new Set(
      all
        .map((c) => c.address ?? [c.street, c.city, c.region, c.postcode].filter(Boolean).join(", "))
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];

  // Anchor the country from the chain (TLD → addresses). Never default to US.
  const country = anchorCountry(host, rawAddresses) ?? (opts.country ?? null);
  if (!country) notes.push("Could not anchor a country from the site or addresses — branches flagged for review.");

  // Normalise → filter (no invented branches; skip coming-soon/closed) → classify
  // HQ/shipping OUT of the roster → dedupe.
  const seen = new Set<string>();
  const out: NormalLocation[] = [];
  const lowConfidence: (NormalLocation & { reason: string })[] = [];
  let skippedNoStreet = 0;
  let skippedNotOpen = 0;
  for (const c of all) {
    if (isNotOpen(c)) { skippedNotOpen++; continue; }
    if (!hasStreetAddress(c)) { skippedNoStreet++; continue; }
    const n = normalize(c, country);
    const key = `${streetKey(n.street) || n.address.toLowerCase()}|${(n.city ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Part 4B — an HQ / shipping / mail-order address is NOT a dine-in branch.
    // Surface it for the operator to confirm; never roster it, never drop it.
    if (classifyAddressType(n) === "hq_shipping") {
      lowConfidence.push({ ...n, reason: "looks like an HQ / shipping / mail-order address — confirm before rostering" });
      continue;
    }
    out.push(n);
  }

  if (skippedNoStreet) notes.push(`${skippedNoStreet} candidate(s) had no verifiable street address and were not seeded.`);
  if (skippedNotOpen) notes.push(`${skippedNotOpen} coming-soon/closed listing(s) were skipped.`);
  if (lowConfidence.length) notes.push(`${lowConfidence.length} HQ/shipping address(es) surfaced as low-confidence (not rostered).`);

  if (out.length === 0 && sourceType === "none") sourceType = "none";

  return {
    website: opts.website,
    locatorUrl,
    sourceType,
    country,
    locations: out,
    lowConfidence,
    notes,
    partial,
    pagesFetched: crawler.fetched,
    skippedNoStreet,
    skippedNotOpen,
    crawledUrls: [...new Set(crawledUrls)],
    rawAddresses,
  };
}
