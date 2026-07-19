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

/** Inject the store tag + attribution subtag into an affiliate URL. */
export function decorateAffiliateUrl(
  href: string,
  subtag: string,
  amazonTag?: string
): string {
  try {
    const url = new URL(href);
    if (/(^|\.)amazon\./i.test(url.hostname)) {
      if (amazonTag && !url.searchParams.get("tag")) {
        url.searchParams.set("tag", amazonTag);
      }
      url.searchParams.set("ascsubtag", subtag);
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
