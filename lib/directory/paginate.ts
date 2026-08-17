/**
 * Directory pagination (Part 7). A country or city hub used to render EVERY venue at
 * once — fine at ~530, wasteful at hundreds per country, and a real mobile problem as
 * City Barbeque + Mission + verticals push single-country counts into the hundreds. This
 * bounds the rendered page to a slice, with real numbered-page URLs so it stays
 * crawlable and canonical-correct (no SEO regression). Pure — unit-tested, and shared by
 * the country and city pages so they paginate identically.
 */

/** Venues per directory page — a bounded first paint, thumb-friendly on mobile. */
export const DIRECTORY_PAGE_SIZE = 24;

export interface Pagination<T> {
  /** The items to render on this page (a bounded slice). */
  items: T[];
  /** 1-based current page, clamped into range. */
  page: number;
  /** Total pages (≥1 even when empty). */
  totalPages: number;
  /** Total item count (the cheap aggregate for headers/chips — never a full re-fetch). */
  total: number;
  perPage: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Coerce an untrusted `?page=` value to a positive integer (default 1). */
export function parsePageParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Slice `items` to `page` (1-based). An out-of-range page clamps to the last real page
 * (so a stale `?page=99` link shows the last page, not an empty one). Pure.
 */
export function paginate<T>(items: T[], page: number, perPage = DIRECTORY_PAGE_SIZE): Pagination<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (clamped - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: clamped,
    totalPages,
    total,
    perPage,
    hasPrev: clamped > 1,
    hasNext: clamped < totalPages,
  };
}

/**
 * The canonical path for a directory page: page 1 is the BARE path (no `?page=1`, so it
 * never duplicates the base URL — the Part 6 concern); page N carries `?page=N`. Used for
 * both the `<link rel="canonical">` and the numbered-link hrefs, so there's exactly one
 * canonical form per page.
 */
export function pagePath(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

/**
 * A compact list of page numbers to render as links — first, last, and a window around
 * the current page, with `null` marking an elision (…). Keeps the control small on a
 * 50-page country while staying fully crawlable via first/last + neighbours.
 */
export function pageWindow(page: number, totalPages: number, span = 1): (number | null)[] {
  if (totalPages <= 1) return [1];
  const set = new Set<number>([1, totalPages]);
  for (let p = page - span; p <= page + span; p++) if (p >= 1 && p <= totalPages) set.add(p);
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}
