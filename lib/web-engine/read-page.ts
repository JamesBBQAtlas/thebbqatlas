/**
 * The Web-Read Engine — client + discovery orchestrator (WEB-ENGINE Part 1 + 2).
 *
 * `readPage` is the ONE interface every consumer calls: it renders a URL in a real
 * browser (Cloudflare Browser Rendering) and captures the data the page loads. The
 * browser itself lives in a Cloudflare Worker; this module is the app-side client +
 * the guardrails (retry, cache, budget) + the discovery consumer. The renderer is an
 * injected seam — production points at the Worker; tests inject a stub — so the whole
 * engine is unit-testable without a live browser.
 */
import { feedBranchesToSeeds, type FeedToSeeds } from "./feed-to-seeds";
import { parseLocatorFeed } from "./locators";
import type { PageRenderer, ReadPageRequest, ReadPageResult, LocatorBranch } from "./types";

const DEFAULT_BUDGET_MS = 25_000;

/** Small per-URL render cache so repeated consumers in one job don't re-render. */
const cache = new Map<string, { at: number; result: ReadPageResult }>();
const CACHE_TTL_MS = 60_000;

/** Politeness + safety wrapper: short-cache, one retry on a transient failure, and a
 *  hard browser-time budget. The renderer does the browser work; this governs it. */
export async function readPage(
  req: ReadPageRequest,
  renderer: PageRenderer,
  opts?: { now?: () => number; cacheKey?: string }
): Promise<ReadPageResult> {
  const now = opts?.now ?? Date.now;
  const key = opts?.cacheKey ?? `${req.url}::${JSON.stringify(req.capture ?? {})}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_TTL_MS) return hit.result;

  const budgetMs = req.budgetMs ?? DEFAULT_BUDGET_MS;
  const run = () => renderer({ ...req, budgetMs });

  let result: ReadPageResult;
  try {
    result = await run();
  } catch (e1) {
    // One retry on a transient failure, then a LOUD structured empty — never a throw.
    try {
      result = await run();
    } catch (e2) {
      return {
        finalUrl: req.url,
        networkResponses: [],
        dom: null,
        text: null,
        debug: {
          capturedPayloads: 0,
          tier: null,
          error: `render failed twice: ${e2 instanceof Error ? e2.message : String(e2)}`,
        },
      };
    }
  }
  cache.set(key, { at: now(), result });
  return result;
}

/** For tests / callers that want a clean slate. */
export function clearReadPageCache(): void {
  cache.clear();
}

export interface EngineDiscovery {
  seeds: FeedToSeeds["seeds"];
  deduped: number;
  dropped: number;
  /** The chain name the feed carried (Olo storename), if any. */
  brandName: string | null;
  platform: string | null;
  /** The rendered DOM / text, so the caller can fall back to the existing HTML parsers
   *  when no structured feed was intercepted (a static or DOM-only locator). */
  dom: string | null;
  text: string | null;
  /** LOUD, structured — records the platform, tier, counts, browser time; never silent. */
  debug: {
    platform: string | null;
    tier: "network" | "dom" | "none";
    branchCount: number;
    candidatePayloads: number;
    seedCount: number;
    deduped: number;
    dropped: number;
    browserMs?: number;
    renderedNodes?: number;
    reason?: string | null;
  };
}

/**
 * DISCOVERY consumer (#1): render a chain's locations page, prefer the intercepted
 * data feed (Olo/Yext/Toast/Algolia/generic), and hand branches to the existing chain
 * machinery as SeedLocation[] (Part A naming applied). When no feed is intercepted, the
 * rendered DOM/text is returned so the caller falls back to today's HTML parsers — the
 * render is never wasted. Always returns a LOUD debug; a truly unreadable locator comes
 * back with tier "none" and a hand-seed reason, never a silent empty.
 */
export async function discoverViaEngine(
  opts: {
    url: string;
    brand: string;
    renderer: PageRenderer;
    budgetMs?: number;
    /** Ordered steps to broaden the locator to the whole country (load-all / paginate). */
    interactions?: ReadPageRequest["interactions"];
  }
): Promise<EngineDiscovery> {
  const result = await readPage(
    {
      url: opts.url,
      waitFor: "networkidle",
      interactions: opts.interactions,
      capture: { network: true, dom: true, text: true },
      budgetMs: opts.budgetMs,
    },
    opts.renderer
  );

  const feed = parseLocatorFeed(result.networkResponses);
  const branches: LocatorBranch[] = feed.branches;
  const { seeds, deduped, dropped } = feedBranchesToSeeds(branches, opts.brand);

  const tier: "network" | "dom" | "none" = seeds.length ? "network" : result.dom ? "dom" : "none";
  return {
    seeds,
    deduped,
    dropped,
    brandName: feed.brand_name,
    platform: feed.platform,
    dom: result.dom,
    text: result.text,
    debug: {
      platform: feed.platform,
      tier,
      branchCount: branches.length,
      candidatePayloads: feed.debug.candidatePayloads,
      seedCount: seeds.length,
      deduped,
      dropped,
      browserMs: result.debug.browserMs,
      renderedNodes: result.debug.renderedNodes,
      reason:
        tier === "none"
          ? `SPA locator — rendered ${result.debug.renderedNodes ?? 0} nodes, captured ${feed.debug.candidatePayloads} payload(s), 0 addresses — hand-seed`
          : tier === "dom"
            ? "no structured feed intercepted — falling back to rendered-DOM parsing"
            : null,
    },
  };
}

/**
 * Production renderer — POSTs a ReadPageRequest to the Cloudflare Browser Rendering
 * Worker and returns its ReadPageResult. The Worker (workers/web-engine) owns the
 * actual Playwright browser + network interception; this is the thin, typed client.
 * Left unused until `WEB_ENGINE_URL` is set + the Worker is deployed (see the ops doc),
 * so nothing changes in the current pipeline before the binding is live.
 */
export function cloudflareRenderer(endpoint: string, secret: string): PageRenderer {
  return async (req: ReadPageRequest): Promise<ReadPageResult> => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-engine-secret": secret },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(`web-engine worker ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    return (await res.json()) as ReadPageResult;
  };
}

/** Is the engine wired? (Set WEB_ENGINE_URL + WEB_ENGINE_SECRET once the Worker ships.) */
export function engineConfigured(): boolean {
  return Boolean(process.env.WEB_ENGINE_URL && process.env.WEB_ENGINE_SECRET);
}
