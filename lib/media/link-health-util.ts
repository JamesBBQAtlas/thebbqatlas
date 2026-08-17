/**
 * Pure link-health helpers (no server-only / no network) so they're unit-testable.
 * Part C — the key rule: a transient failure is NEVER a false "broken".
 */
export type LinkStatus = "ok" | "broken" | "redirected" | "unchecked";

/**
 * Classify a generic HTTP outcome. 2xx/3xx (followed) → ok; a genuine 4xx →
 * broken; but a BOT-BLOCK or transient outcome → `unchecked` (retry, never a false
 * "broken"): 401/403 (auth wall / bot block), 429 (rate-limited), 999 (LinkedIn-style
 * block), any 5xx, and a null (timeout/network error). Only an unambiguous "this page
 * is gone" 4xx (404/410, and other 4xx) is `broken`.
 */
export function classifyHttp(status: number | null): LinkStatus {
  if (status === null) return "unchecked"; // network error / timeout → retry
  if (isBotBlockStatus(status)) return "unchecked"; // 401/403/429/999 → bot block, NOT dead
  if (status >= 200 && status < 400) return "ok";
  if (status >= 400 && status < 500) return "broken";
  return "unchecked"; // 5xx — server-side, transient; retry
}

/**
 * HTTP statuses that mean "an automated request was BLOCKED", not "the page is dead":
 * 401 (auth wall), 403 (Forbidden / bot challenge), 429 (rate-limited), 999 (the
 * non-standard block code some CDNs return). A valid link behind one of these must be
 * `unchecked`/unverified, never `broken` — the whole point of Part 2.
 */
export function isBotBlockStatus(status: number | null): boolean {
  return status === 401 || status === 403 || status === 429 || status === 999;
}

/**
 * Extract a 10-character Amazon ASIN from a product URL (`/dp/<ASIN>`,
 * `/gp/product/<ASIN>`, `/gp/aw/d/<ASIN>`, `/product/<ASIN>`). Returns the uppercased
 * ASIN, or null if the URL carries no well-formed ASIN. Pure — the basis for
 * format-verifying a bot-protected retail link without fetching it.
 */
export function extractAsin(url: string): string | null {
  const m = url.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** The Amazon short-link hosts (they redirect to a product page we can't fetch). */
const AMAZON_SHORT_HOSTS = new Set(["amzn.to", "amzn.eu", "a.co"]);

/** The hostname of a URL, lowercased — or "" if it won't parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Is this a bot-protected RETAIL domain we validate by FORMAT, never by fetch?
 *  Amazon (any TLD, e.g. amazon.com / amazon.co.uk) and its short-link hosts. */
export function isRetailUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const host = hostOf(url);
  if (!host) return /(?:^|\/\/|\.)(?:amazon\.[a-z]|amzn\.(?:to|eu))/i.test(url);
  return /(^|\.)amazon\.[a-z.]{2,}$/.test(host) || AMAZON_SHORT_HOSTS.has(host);
}

/** Is this a bare Amazon SHORT-link (amzn.to/…) whose ASIN we can't read from the path? */
export function isAmazonShortLink(url: string): boolean {
  const host = hostOf(url);
  return host ? AMAZON_SHORT_HOSTS.has(host) : /(?:^|\/\/|\.)(?:amzn\.(?:to|eu)|a\.co)\//i.test(url);
}

/**
 * FORMAT-verify a bot-protected retail (Amazon) link WITHOUT fetching it. Amazon blocks
 * automated requests, so a fetch returns a 403 / CAPTCHA / soft-404 that says nothing
 * about whether the product exists — fetching it is exactly what false-flagged 15 valid
 * affiliate books as "broken". Instead: a well-formed amazon URL carrying a valid
 * 10-char ASIN is OK (format-verified); a missing/short ASIN is genuinely `broken`
 * (malformed). A bare short-link (amzn.to/…) we can't parse an ASIN from is left
 * `unchecked` — unverifiable without following it, but never falsely "broken".
 */
export function classifyRetailFormat(url: string): LinkHealthResult {
  const asin = extractAsin(url);
  if (asin) {
    return { status: "ok", code: null, note: "format-verified (valid ASIN; Amazon blocks automated checks)" };
  }
  // A short-link with no ASIN in the path can't be format-verified, but isn't broken.
  if (isAmazonShortLink(url)) {
    return { status: "unchecked", code: null, note: "Amazon short-link — can't verify ASIN by format, not fetched" };
  }
  return { status: "broken", code: null, note: "malformed Amazon link — no valid 10-character ASIN" };
}

export interface LinkHealthResult {
  status: LinkStatus;
  code: number | null;
  note: string | null;
}

/**
 * The outcome of a YouTube CHANNEL check, ready to classify. A channel can't be
 * validated by oEmbed (oEmbed only supports videos → a live channel 404s), so we
 * ask the YouTube Data API `channels.list` instead:
 *   • `items`     — the API answered 200; `count` is how many channels matched
 *                   (≥1 ⇒ live, 0 ⇒ genuinely gone);
 *   • `api_error` — the API answered non-2xx (bad key, quota, 5xx) → NOT broken,
 *                   just uncheckable right now;
 *   • `network`   — timeout / network error → NOT broken, retry;
 *   • `page`      — no API key: we fell back to fetching the channel page, and
 *                   `dead` is whether the "channel does not exist / terminated"
 *                   copy was present.
 * The cardinal rule (Part C): a transient/uncheckable outcome is NEVER `broken`.
 */
export type ChannelOutcome =
  | { kind: "items"; count: number }
  | { kind: "api_error"; code: number }
  | { kind: "network" }
  | { kind: "page"; status: number | null; dead: boolean };

export function classifyChannelHealth(o: ChannelOutcome): LinkHealthResult {
  switch (o.kind) {
    case "network":
      return { status: "unchecked", code: null, note: "network error — will retry" };
    case "api_error":
      // A bad handle to the API is ambiguous (could be a formatting issue, not a
      // dead channel), and quota/5xx are transient — never flag broken on these.
      return { status: "unchecked", code: o.code, note: `YouTube API ${o.code} — couldn't verify, will retry` };
    case "items":
      return o.count >= 1
        ? { status: "ok", code: 200, note: null }
        : { status: "broken", code: 200, note: "channel not found" };
    case "page":
      if (o.dead) return { status: "broken", code: o.status, note: "channel unavailable" };
      return { status: classifyHttp(o.status), code: o.status, note: null };
  }
}
