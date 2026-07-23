import { BRAND } from "@/lib/constants/styles";

/**
 * Canonical site origin. Comes from NEXT_PUBLIC_SITE_URL in every real
 * environment; the fallback only matters for local dev. No trailing slash.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://thebbqatlas.com"
).replace(/\/+$/, "");

export const SITE = {
  name: BRAND.name,
  url: SITE_URL,
  description:
    "A curated global atlas of the world's great barbecue — smokehouses, asados, Korean grills, churrasco and more. Explore the map, read the guides, celebrate the craft.",
  logo: `${SITE_URL}/logos/crest-emblem.png`,
  // Official social profiles — kept in sync with the footer's social links so
  // the Organization sameAs and the visible footer agree (F-34). Update both
  // together if a handle changes.
  sameAs: [
    "https://instagram.com/thebbqatlas",
    "https://threads.net/@thebbqatlas",
  ] as string[],
} as const;

/** Turn a site-relative path into an absolute canonical URL. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}/${path.replace(/^\/+/, "")}`.replace(/\/$/, "") || SITE_URL;
}
