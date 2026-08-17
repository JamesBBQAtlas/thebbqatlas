/**
 * The Web-Read Engine — types (WEB-ENGINE). A general, domain-agnostic primitive
 * that drives a real browser (Cloudflare Browser Rendering) and captures the data a
 * page loads, so any consumer (chain discovery, enrichment, closure/pin/link checks)
 * reads modern JS-rendered sites instead of getting an empty fetch-only shell.
 *
 * ZERO domain assumptions live here — no BBQ, no venue category. The engine returns
 * raw structured facts; a vertical layer interprets them. This is a primitive meant
 * to carry to a Burger Atlas / Pizza Atlas with thousands of locations per chain.
 */

/** One ordered browser step to coax a page into yielding its FULL dataset — broaden
 *  a search, zoom a map right out, click "load all", paginate. Kept declarative so a
 *  consumer can describe intent without touching Playwright. */
export type Interaction =
  | { type: "click"; selector: string }
  | { type: "type"; selector: string; text: string }
  | { type: "scroll"; to?: "bottom" | "top"; times?: number }
  | { type: "waitFor"; selector?: string; ms?: number }
  | { type: "press"; key: string };

export interface ReadPageRequest {
  url: string;
  /** A selector, a millisecond budget, or "networkidle" to wait for before capture. */
  waitFor?: string | number | "networkidle";
  /** Ordered steps run after load, before capture (broaden search, load-all, paginate). */
  interactions?: Interaction[];
  capture?: {
    /** Record XHR/fetch/GraphQL responses — the primary source (the locator's own JSON). */
    network?: boolean;
    /** Rendered DOM / specific selectors. */
    dom?: boolean;
    /** Cleaned readable text of the page. */
    text?: boolean;
    screenshot?: boolean;
  };
  /** Hard cap on browser time for this call (ms) — the cost guard. */
  budgetMs?: number;
}

/** One intercepted network response (parsed JSON when the body was JSON). */
export interface CapturedResponse {
  url: string;
  status: number;
  contentType?: string | null;
  /** Parsed JSON body when the response was JSON; else the raw string; else null. */
  body: unknown;
}

export interface ReadPageResult {
  finalUrl: string;
  networkResponses: CapturedResponse[];
  dom: string | null;
  text: string | null;
  screenshot?: string | null;
  /** LOUD, structured debug — every call records what happened, never a silent empty. */
  debug: {
    /** Rendered DOM node count (0 → the page never populated). */
    renderedNodes?: number;
    /** How many network payloads were captured. */
    capturedPayloads: number;
    /** Which capture tier produced usable data ("network" | "dom" | "text" | null). */
    tier: string | null;
    browserMs?: number;
    error?: string | null;
  };
}

/** The renderer seam — production points at the Cloudflare Browser Rendering Worker;
 *  tests inject a stub that returns canned network responses. Keeps the whole engine
 *  unit-testable without a live browser. */
export type PageRenderer = (req: ReadPageRequest) => Promise<ReadPageResult>;

/**
 * A DOMAIN-AGNOSTIC location record extracted from a locator feed or the rendered DOM.
 * Raw facts only — the vertical layer maps these onto its own schema. `brand_name` is
 * the CHAIN name from the feed (Olo `storename`); `location_label` is the BRANCH label
 * (Olo `name`, e.g. "Acworth") — kept separate so the branch is never named after its
 * heading (the Part A rule).
 */
export interface LocatorBranch {
  brand_name?: string | null;
  location_label?: string | null;
  /** Street line (building number + street + unit), no city/region/postcode. */
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  /** The platform's own id — for idempotent re-runs at scale. */
  external_id?: string | null;
  /** Which adapter produced this ("olo" | "yext" | "toast" | "algolia" | "generic" …). */
  platform?: string | null;
  source_url?: string | null;
}

/** The result of reading a locator feed — branches + which platform/tier, LOUD debug. */
export interface LocatorFeedResult {
  branches: LocatorBranch[];
  /** The chain's own name if the feed carried it (Olo storename). */
  brand_name: string | null;
  platform: string | null;
  debug: {
    tier: "network" | "dom" | "none";
    platform: string | null;
    candidatePayloads: number;
    branchCount: number;
    reason?: string | null;
  };
}
