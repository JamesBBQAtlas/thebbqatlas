import "server-only";

/** ISBN-10 sits in the Amazon /dp/<asin> for these cookbook links. */
export function isbnFromAmazon(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/dp\/([0-9Xx]{10})/);
  return m ? m[1].toUpperCase() : null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const STOP = new Set(["the", "a", "an", "of", "and", "to", "for", "with"]);
// Generic barbecue/cookbook words that must not, on their own, confirm a match.
const GENERIC = new Set([
  "barbecue", "bbq", "grill", "grilling", "smoke", "smoking", "fire", "food",
  "cookbook", "book", "meat", "recipes", "recipe", "guide", "cooking",
]);

const sigWords = (s: string): string[] =>
  norm(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));

/**
 * Title match that tolerates subtitle asymmetry (our DB title often carries a
 * long subtitle — "Meathead: The Science of…" — while the store lists just
 * "Meathead") WITHOUT ever confirming a wrong cover. We compare significant
 * words bidirectionally and require 60% of the SHORTER title's words to be
 * shared, so distinct siblings like "Project Fire" vs "Project Smoke" (only the
 * generic word overlaps → 1/2 = 0.5) still fail. A single shared word only
 * confirms a match when it's distinctive, never a generic barbecue term.
 */
function titleMatches(candidate: string | undefined, want: string): boolean {
  if (!candidate) return false;
  const w = sigWords(want);
  const c = sigWords(candidate);
  if (w.length === 0) return true;
  if (c.length === 0) return false;
  const cset = new Set(c);
  const shared = w.filter((x) => cset.has(x));
  const smaller = Math.min(w.length, c.length);
  if (shared.length / smaller < 0.6) return false;
  if (smaller === 1) return !GENERIC.has(shared[0]);
  return true;
}

/** First author only, cleaned of "&"/"," and any trailing "(DJ BBQ)" style note. */
function firstAuthor(author: string | null): string {
  if (!author) return "";
  return author.split(/[,&(]/)[0].trim();
}

/**
 * iTunes / Apple Books ebook search — keyless and (unlike keyless Google Books)
 * not aggressively rate-limited, the same source we already use reliably for
 * podcast art. Returns a validated high-res cover or null. Server-side only.
 */
async function fromItunes(title: string, author: string | null): Promise<string | null> {
  const term = `${title} ${firstAuthor(author)}`.trim();
  // Try the US storefront first, then GB — several of our picks are UK titles
  // (DJ BBQ, Genevieve Taylor…) that only list on Apple Books UK.
  for (const country of ["US", "GB"]) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=ebook&entity=ebook&limit=8&country=${country}`,
        { next: { revalidate: 604800 } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: { trackName?: string; artworkUrl100?: string }[];
      };
      for (const r of data.results ?? []) {
        // Only accept a result whose title really matches ours — never a wrong cover.
        if (r.artworkUrl100 && titleMatches(r.trackName, title)) {
          return r.artworkUrl100
            .replace(/^http:\/\//, "https://")
            .replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.$1");
        }
      }
    } catch {
      // try next storefront / fall through to Google Books
    }
  }
  return null;
}

/**
 * Google Books by ISBN first then title+author. Uses GOOGLE_BOOKS_API_KEY when
 * set (keyless is heavily rate-limited — 429s — from datacenter IPs). Validates
 * the volume title roughly matches ours so we never ship a WRONG cover.
 */
async function fromGoogle(
  amazonUrl: string,
  title: string,
  author: string | null
): Promise<string | null> {
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const isbn = isbnFromAmazon(amazonUrl);
  const queries: string[] = [];
  if (isbn) queries.push(`isbn:${isbn}`);
  const a = firstAuthor(author);
  queries.push(`intitle:${title}${a ? ` inauthor:${a}` : ""}`);

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&country=US${
          key ? `&key=${key}` : ""
        }`,
        { next: { revalidate: 604800 } }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        items?: { volumeInfo?: { title?: string; imageLinks?: Record<string, string> } }[];
      };
      for (const it of data.items ?? []) {
        const vi = it.volumeInfo ?? {};
        const img = vi.imageLinks?.thumbnail ?? vi.imageLinks?.smallThumbnail;
        if (!img) continue;
        // For the ISBN query we trust the match; for title search, validate.
        if (q.startsWith("isbn:") || titleMatches(vi.title, title)) {
          return img
            .replace(/^http:\/\//, "https://")
            .replace(/&edge=curl/, "")
            .replace(/&zoom=\d/, "");
        }
      }
    } catch {
      // try next query / fall through to placeholder
    }
  }
  return null;
}

/**
 * Resolve a book cover, validated so we NEVER ship a wrong one (a mismatch falls
 * back to the placeholder). Tries Apple Books (keyless, un-throttled) first, then
 * Google Books. Cached a week; returns null → the card shows the branded
 * placeholder. Server-side only. Intended to be resolved once and persisted to
 * media_picks.image_url, not called per render.
 */
export async function resolveBookCover(
  amazonUrl: string,
  title: string,
  author: string | null
): Promise<string | null> {
  return (await fromItunes(title, author)) ?? (await fromGoogle(amazonUrl, title, author));
}

export interface BookMeta {
  title: string;
  author: string | null;
  cover: string | null;
}

/**
 * Resolve a book's title/author/cover from just an Amazon URL, for the WRL "Add
 * a book" flow (Part B, B4). Looks the ISBN up on Google Books; falls back to
 * iTunes for a cover if Google has no image. Returns null when there's no ISBN
 * in the URL or nothing resolves — the operator then types title/author by hand.
 * We deliberately DON'T decorate or store the affiliate tag here: the raw Amazon
 * product URL is stored, and the earn-tag is applied only at render by
 * AffiliateLink (keeps the "no link ships unless it earns" rule intact).
 * Server-side only.
 */
export async function resolveBookByUrl(amazonUrl: string): Promise<BookMeta | null> {
  const isbn = isbnFromAmazon(amazonUrl);
  if (!isbn) return null;
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&country=US${
        key ? `&key=${key}` : ""
      }`,
      { next: { revalidate: 604800 } }
    );
    if (!res.ok) return null;
    const vi = (
      (await res.json()) as {
        items?: { volumeInfo?: { title?: string; authors?: string[]; imageLinks?: Record<string, string> } }[];
      }
    ).items?.[0]?.volumeInfo;
    if (!vi?.title) return null;
    const author = vi.authors && vi.authors.length ? vi.authors.join(", ") : null;
    const img = vi.imageLinks?.thumbnail ?? vi.imageLinks?.smallThumbnail ?? null;
    const cover =
      (img
        ? img.replace(/^http:\/\//, "https://").replace(/&edge=curl/, "").replace(/&zoom=\d/, "")
        : null) ?? (await fromItunes(vi.title, author));
    return { title: vi.title, author, cover };
  } catch {
    return null;
  }
}
