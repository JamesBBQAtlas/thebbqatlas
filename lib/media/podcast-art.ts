import "server-only";

/** Pull the numeric Apple podcast id out of an Apple Podcasts URL (…/id123456). */
export function appleIdFrom(appleUrlOrId: string | null | undefined): string | null {
  if (!appleUrlOrId) return null;
  const m = String(appleUrlOrId).match(/id(\d{3,})/);
  return m ? m[1] : /^\d{3,}$/.test(String(appleUrlOrId)) ? String(appleUrlOrId) : null;
}

/**
 * Resolve a podcast's cover art from the free iTunes Lookup API (no key). Cached
 * for a week via the fetch cache so it's one call per show, not per request.
 * Returns a 600px artwork URL, or null (caller falls back to a placeholder).
 * Runs server-side on Vercel — never blocks render on failure.
 */
export async function resolvePodcastArtwork(
  appleUrlOrId: string | null | undefined
): Promise<string | null> {
  const id = appleIdFrom(appleUrlOrId);
  if (!id) return null;
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, {
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { artworkUrl600?: string; artworkUrl100?: string }[];
    };
    const r = data.results?.[0];
    const art = r?.artworkUrl600 ?? r?.artworkUrl100 ?? null;
    return art ? art.replace(/100x100(bb)?\.jpg$/, "600x600$1.jpg") : null;
  } catch {
    return null;
  }
}
