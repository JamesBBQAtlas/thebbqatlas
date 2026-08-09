/**
 * Affiliate attribution. Every affiliate link carries a per-page/per-restaurant
 * subtag so revenue can be attributed to the exact page later — this cannot be
 * backfilled, so it ships from launch. Amazon uses `ascsubtag` (+ the store
 * `tag`); other partners get a generic utm_content subid.
 */

export interface AffiliateContext {
  restaurantSlug?: string;
  pagePath?: string;
  product?: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Compact, human-readable attribution tag, e.g. atlas_r-franklin-barbecue-austin_oklahoma-joe. */
export function buildSubtag(ctx: AffiliateContext): string {
  const parts = ["atlas"];
  if (ctx.restaurantSlug) {
    parts.push(`r-${ctx.restaurantSlug}`);
  } else {
    const p = (ctx.pagePath ?? "").replace(/^\/+/, "").replace(/\/+/g, "-");
    parts.push(`p-${p || "home"}`);
  }
  if (ctx.product) parts.push(slugify(ctx.product).slice(0, 24));
  return parts.join("_").replace(/_+/g, "_").slice(0, 90);
}

export function detectPartner(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    if (/amazon\./i.test(host)) return "amazon";
    return host.split(".")[0] || "other";
  } catch {
    return "other";
  }
}

/**
 * Affiliate tags/refs (overridable via env; safe defaults so links always work).
 *
 * Amazon: the site ONLY ever emits US `amazon.com` links carrying the US "home"
 * tag (`thebbqatlasus-20`). International routing is handled entirely Amazon-side
 * by OneLink — `thebbqatlas.com` is registered as a traffic source on the US
 * Associates account, so when an international shopper lands on one of our
 * amazon.com links, Amazon auto-redirects them to their local store with the
 * per-country tag mapped in the OneLink dashboard. There is NO on-site script or
 * geo logic here (the old `onejs` widget model is deprecated and not used).
 *
 * Dalstrong is a single global program keyed on `?ref`.
 */
export const AMAZON_ONELINK_TAG =
  process.env.NEXT_PUBLIC_AMAZON_ONELINK_TAG?.trim() || "thebbqatlasus-20";
export const DALSTRONG_REF =
  process.env.NEXT_PUBLIC_DALSTRONG_REF?.trim() || "bbqatlas";
export const DALSTRONG_HOME = `https://dalstrong.com/?ref=${DALSTRONG_REF}`;

/**
 * The affiliate HARD RULE (James's #1): an Amazon link earns ONLY if it points at
 * the US store (`amazon.com` — OneLink routes international shoppers onward from
 * there) AND our US home tag is configured. A foreign-store URL
 * (`amazon.co.uk`/`.de`/…) or a URL carrying a hard-coded foreign tag earns $0
 * under the US tag and therefore FAILS the rule. Non-Amazon partners
 * (Dalstrong/other) run their own programs and always pass.
 *
 * This is the single predicate the render path, the CI tripwire, and the admin
 * QA view all use, so "can this link earn?" has exactly one definition.
 */
export function affiliateUrlEarns(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const bare = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!/(^|\.)amazon\./i.test(bare)) return true; // non-Amazon — its own program
  if (bare !== "amazon.com") return false; // a foreign store can't earn under the US tag
  if (!AMAZON_ONELINK_TAG) return false; // no earning tag configured
  const existing = url.searchParams.get("tag");
  if (existing && existing.trim() && existing.trim() !== AMAZON_ONELINK_TAG) return false; // hard-coded foreign tag
  return true;
}

/**
 * Inject the store tag/ref + attribution subtag into an affiliate URL. Returns
 * `null` when an Amazon link cannot earn (the caller must then NOT render the buy
 * control) — never a plain, $0 Amazon URL. Throws in dev/test so a non-earning
 * link is caught loudly at build time, not shipped.
 */
export function decorateAffiliateUrl(
  href: string,
  subtag: string,
  amazonTag?: string
): string | null {
  try {
    const url = new URL(href);
    if (/(^|\.)amazon\./i.test(url.hostname)) {
      // HARD RULE — never emit a tagless / wrong-store Amazon link.
      if (!affiliateUrlEarns(href)) {
        if (process.env.NODE_ENV !== "production") {
          throw new Error(
            `Affiliate rule violated: "${href}" cannot earn. Amazon links must be an amazon.com URL under the US tag (${AMAZON_ONELINK_TAG || "unset"}) — no foreign store, no foreign tag.`
          );
        }
        return null; // production: drop the buy control rather than ship a $0 link
      }
      const tag = amazonTag?.trim() || AMAZON_ONELINK_TAG;
      if (tag && !url.searchParams.get("tag")) {
        url.searchParams.set("tag", tag);
      }
      url.searchParams.set("ascsubtag", subtag);
    } else if (/(^|\.)dalstrong\./i.test(url.hostname)) {
      if (!url.searchParams.get("ref")) {
        url.searchParams.set("ref", DALSTRONG_REF);
      }
      url.searchParams.set("utm_content", subtag);
    } else {
      if (!url.searchParams.get("utm_source")) {
        url.searchParams.set("utm_source", "thebbqatlas");
      }
      if (!url.searchParams.get("utm_medium")) {
        url.searchParams.set("utm_medium", "affiliate");
      }
      url.searchParams.set("utm_content", subtag);
    }
    return url.toString();
  } catch {
    return href;
  }
}
