import "server-only";

export interface YouTubeData {
  thumb: string | null;
  subscriberCount: string | null;
  latest: { title: string; videoId: string; thumb: string | null } | null;
}

/** Channel handle from a /@handle URL. */
export function handleFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/@([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}

/**
 * Channel avatar + subscriber count (+ latest upload) via the YouTube Data API.
 * Reads YOUTUBE_API_KEY from env (set in Vercel); returns null with no key so the
 * card falls back to the branded placeholder. Cached a day (well within YouTube's
 * ~30-day freshness expectation). subscriberCount is returned verbatim from the
 * API — no derived metrics. Server-side only.
 */
export async function resolveYouTube(url: string): Promise<YouTubeData | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const handle = handleFrom(url);
  if (!key || !handle) return null;

  try {
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(
        handle
      )}&key=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!chRes.ok) return null;
    const ch = (
      (await chRes.json()) as {
        items?: {
          snippet?: { thumbnails?: Record<string, { url?: string }> };
          statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
          contentDetails?: { relatedPlaylists?: { uploads?: string } };
        }[];
      }
    ).items?.[0];
    if (!ch) return null;

    const thumb =
      ch.snippet?.thumbnails?.high?.url ??
      ch.snippet?.thumbnails?.medium?.url ??
      ch.snippet?.thumbnails?.default?.url ??
      null;
    const subscriberCount = ch.statistics?.hiddenSubscriberCount
      ? null
      : ch.statistics?.subscriberCount ?? null;

    let latest: YouTubeData["latest"] = null;
    const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) {
      const plRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=1&playlistId=${uploads}&key=${key}`,
        { next: { revalidate: 86400 } }
      );
      if (plRes.ok) {
        const sn = (
          (await plRes.json()) as {
            items?: {
              snippet?: {
                title?: string;
                resourceId?: { videoId?: string };
                thumbnails?: Record<string, { url?: string }>;
              };
            }[];
          }
        ).items?.[0]?.snippet;
        if (sn?.resourceId?.videoId) {
          latest = {
            title: sn.title ?? "",
            videoId: sn.resourceId.videoId,
            thumb: sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
          };
        }
      }
    }
    return { thumb, subscriberCount, latest };
  } catch {
    return null;
  }
}
