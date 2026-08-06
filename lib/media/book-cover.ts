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

/**
 * Resolve a book cover via the free Google Books API (no key), by ISBN first then
 * title+author. Validates the returned volume's title roughly matches ours so we
 * never ship a WRONG cover (the reason we dropped Open-Library-by-ASIN). Cached a
 * week; returns null → the card shows the branded placeholder. Server-side only.
 */
export async function resolveBookCover(
  amazonUrl: string,
  title: string,
  author: string | null
): Promise<string | null> {
  const isbn = isbnFromAmazon(amazonUrl);
  const queries: string[] = [];
  if (isbn) queries.push(`isbn:${isbn}`);
  const a = author ? author.split(/[,&]/)[0].trim() : "";
  queries.push(`intitle:${title}${a ? ` inauthor:${a}` : ""}`);

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&country=US`,
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
