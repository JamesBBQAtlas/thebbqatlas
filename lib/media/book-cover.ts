import "server-only";

/** ISBN-10 sits in the Amazon /dp/<asin> for these cookbook links. */
export function isbnFromAmazon(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/dp\/([0-9Xx]{10})/);
  return m ? m[1].toUpperCase() : null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Rough title match: most of our title's real words appear in the candidate. */
function titleMatches(candidate: string | undefined, want: string): boolean {
  if (!candidate) return false;
  const c = norm(candidate);
  const stop = new Set(["the", "a", "an", "of", "and", "to", "for", "with"]);
  const words = norm(want)
    .split(" ")
    .filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return true;
  const hits = words.filter((w) => c.includes(w)).length;
  return hits / words.length >= 0.6;
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
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=ebook&entity=ebook&limit=8&country=US`,
      { next: { revalidate: 604800 } }
    );
    if (!res.ok) return null;
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
    // fall through to Google Books
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
