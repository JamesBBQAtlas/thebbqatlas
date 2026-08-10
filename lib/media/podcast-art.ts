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
  const meta = await resolvePodcastMeta(appleUrlOrId);
  return meta?.artwork ?? null;
}

export interface PodcastMeta {
  name: string;
  publisher: string | null;
  artwork: string | null;
}

/**
 * Resolve a podcast's show name + publisher + artwork from an Apple Podcasts URL
 * (or numeric id), for the WRL "Add a podcast" flow (Part B, B4). Uses the free
 * iTunes Lookup API (no key). Returns null when there's no Apple id or nothing
 * resolves. Server-side only.
 */
export async function resolvePodcastMeta(
  appleUrlOrId: string | null | undefined
): Promise<PodcastMeta | null> {
  const id = appleIdFrom(appleUrlOrId);
  if (!id) return null;
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, {
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;
    const r = (
      (await res.json()) as {
        results?: {
          collectionName?: string;
          trackName?: string;
          artistName?: string;
          artworkUrl600?: string;
          artworkUrl100?: string;
        }[];
      }
    ).results?.[0];
    if (!r) return null;
    const art = r.artworkUrl600 ?? r.artworkUrl100 ?? null;
    return {
      name: r.collectionName ?? r.trackName ?? "",
      publisher: r.artistName ?? null,
      artwork: art ? art.replace(/100x100(bb)?\.jpg$/, "600x600$1.jpg") : null,
    };
  } catch {
    return null;
  }
}
