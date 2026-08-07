import "server-only";

export interface YouTubeData {
  channelId: string | null;
  thumb: string | null;
  subscriberCount: string | null;
  latest: { title: string; videoId: string; thumb: string | null } | null;
}

/** Best available thumbnail from a YouTube thumbnails map, highest res first. */
function bestThumb(
  thumbs: Record<string, { url?: string }> | undefined,
  order: string[]
): string | null {
  if (!thumbs) return null;
  for (const k of order) {
    const u = thumbs[k]?.url;
    if (u) return u;
  }
  return null;
}

export interface YouTubeVideoData {
  videoId: string;
  title: string;
  channelTitle: string;
  thumb: string | null;
  duration: string | null; // ISO 8601 (PT#M#S) as returned by the API
  embeddable: boolean;
}

/** Extract a YouTube video id from a watch/share/embed URL or a bare id. */
export function videoIdFrom(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

/**
 * Resolve a single video's metadata via videos.list (snippet + contentDetails +
 * status). Used for "Episodes We Love" and venue featured videos — validate the
 * id exists and is embeddable, and cache title/channel/thumb/duration. Returns
 * null with no key or on any failure. Server-side only.
 */
export async function resolveYouTubeVideo(
  input: string
): Promise<YouTubeVideoData | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const id = videoIdFrom(input);
  if (!key || !id) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${encodeURIComponent(id)}&key=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const item = (
      (await res.json()) as {
        items?: {
          snippet?: {
            title?: string;
            channelTitle?: string;
            thumbnails?: Record<string, { url?: string }>;
          };
          contentDetails?: { duration?: string };
          status?: { embeddable?: boolean };
        }[];
      }
    ).items?.[0];
    if (!item) return null;
    return {
      videoId: id,
      title: item.snippet?.title ?? "",
      channelTitle: item.snippet?.channelTitle ?? "",
      thumb: bestThumb(item.snippet?.thumbnails, [
        "maxres",
        "standard",
        "high",
        "medium",
        "default",
      ]),
      duration: item.contentDetails?.duration ?? null,
      embeddable: item.status?.embeddable !== false,
    };
  } catch {
    return null;
  }
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
export async function resolveYouTube(
  url: string,
  channelId0?: string | null
): Promise<YouTubeData | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const handle = handleFrom(url);
  // Prefer a pinned channel id (some channels' @handle doesn't resolve via
  // forHandle — e.g. Ant's BBQ Cookout); fall back to the handle.
  const selector = channelId0
    ? `id=${encodeURIComponent(channelId0)}`
    : handle
      ? `forHandle=${encodeURIComponent(handle)}`
      : null;
  if (!key || !selector) return null;

  try {
    const chRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&${selector}&key=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!chRes.ok) return null;
    const ch = (
      (await chRes.json()) as {
        items?: {
          id?: string;
          snippet?: { thumbnails?: Record<string, { url?: string }> };
          statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
          contentDetails?: { relatedPlaylists?: { uploads?: string } };
        }[];
      }
    ).items?.[0];
    if (!ch) return null;

    const channelId = ch.id ?? channelId0 ?? null;
    const thumb = bestThumb(ch.snippet?.thumbnails, ["high", "medium", "default"]);
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
            thumb: bestThumb(sn.thumbnails, [
              "maxres",
              "standard",
              "high",
              "medium",
              "default",
            ]),
          };
        }
      }
    }
    return { channelId, thumb, subscriberCount, latest };
  } catch {
    return null;
  }
}
