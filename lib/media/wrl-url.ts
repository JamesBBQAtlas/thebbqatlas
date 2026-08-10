/**
 * Pure URL helpers for the Watch/Read/Listen admin (Part B follow-ups). NO
 * `server-only` import here on purpose — the add/edit modal (client) and the unit
 * tests both use these to detect a link's kind, extract its stable id, and catch
 * duplicates BEFORE a network round-trip. The server resolvers (youtube.ts,
 * book-cover.ts, podcast-art.ts) keep their own extractors for their own use;
 * these are the shared, dependency-free versions.
 */

export type MediaKind = "youtube" | "video" | "book" | "podcast";

/** A single YouTube VIDEO id (watch / youtu.be / shorts / embed / bare id). */
export function extractYouTubeVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const pats = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

/** A YouTube channel @handle (from /@handle or a bare @handle). */
export function extractYouTubeHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/@([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}

/** A YouTube channel id (/channel/UC…). */
export function extractYouTubeChannelId(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

/** An Amazon ASIN / ISBN-10 from a /dp/<asin> or /gp/product/<asin> link. */
export function extractAmazonAsin(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([0-9A-Za-z]{10})/);
  return m ? m[1].toUpperCase() : null;
}

/** The numeric Apple Podcasts id (…/id123456). */
export function extractApplePodcastId(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/id(\d{3,})/);
  if (m) return m[1];
  return /^\d{3,}$/.test(String(input).trim()) ? String(input).trim() : null;
}

/** A Spotify show id (open.spotify.com/show/<id>). */
export function extractSpotifyShowId(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(/open\.spotify\.com\/show\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());

/**
 * Detect which WRL kind a pasted URL is. `youtube` = a channel (adds a channel
 * card); `video` = a single clip ("Episodes We Love"); `book` = an Amazon
 * product; `podcast` = Apple/Spotify/RSS. Returns null when it can't tell — the
 * operator then picks the kind manually.
 */
export function detectMediaKind(input: string | null | undefined): MediaKind | null {
  if (!input) return null;
  const s = String(input).trim();
  const lower = s.toLowerCase();

  // A YouTube link is either a single video or a channel.
  if (/youtube\.com|youtu\.be/.test(lower)) {
    if (extractYouTubeVideoId(s)) return "video";
    if (extractYouTubeHandle(s) || extractYouTubeChannelId(s) || /\/(c|user)\//.test(lower)) return "youtube";
    return "youtube";
  }
  if (/amazon\./.test(lower) || extractAmazonAsin(s)) return "book";
  if (/podcasts\.apple\.com|open\.spotify\.com\/show/.test(lower)) return "podcast";
  return null;
}

/**
 * A stable dedupe KEY for a link, so "youtu.be/ABC" and
 * "youtube.com/watch?v=ABC" (or a book URL with/without tracking params) collide.
 * Falls back to a normalised URL string when no stable id is found.
 */
export function mediaDedupeKey(input: string | null | undefined): string {
  if (!input) return "";
  const s = String(input).trim();
  const vid = extractYouTubeVideoId(s);
  if (vid) return `yt-video:${vid}`;
  const chId = extractYouTubeChannelId(s);
  if (chId) return `yt-channel:${chId.toLowerCase()}`;
  const handle = extractYouTubeHandle(s);
  if (handle && /youtube\.com/i.test(s)) return `yt-handle:${handle.toLowerCase()}`;
  const asin = extractAmazonAsin(s);
  if (asin) return `amazon:${asin}`;
  const apple = /podcasts\.apple\.com/i.test(s) ? extractApplePodcastId(s) : null;
  if (apple) return `apple-podcast:${apple}`;
  const spotify = extractSpotifyShowId(s);
  if (spotify) return `spotify-show:${spotify}`;
  // Generic: drop protocol/host-www/trailing-slash/query/hash so trivial
  // variations of the same page collide.
  return isHttpUrl(s)
    ? s
        .toLowerCase()
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/[?#].*$/, "")
        .replace(/\/+$/, "")
    : s.toLowerCase();
}

/**
 * Find an existing row whose URL is the same media as `url` (by dedupe key).
 * `exceptId` skips the row being edited so a save doesn't flag itself.
 */
export function findDuplicateByUrl<T extends { id: string; url: string }>(
  url: string | null | undefined,
  rows: T[],
  exceptId?: string
): T | null {
  const key = mediaDedupeKey(url);
  if (!key) return null;
  for (const r of rows) {
    if (exceptId && r.id === exceptId) continue;
    if (mediaDedupeKey(r.url) === key) return r;
  }
  return null;
}

/**
 * Reassign contiguous `sort_order` values (0..n-1) from an ordered list of ids.
 * Pure — the UI computes the new order optimistically, then persists this.
 */
export function reindexOrder(ids: string[]): { id: string; sort_order: number }[] {
  return ids.map((id, i) => ({ id, sort_order: i }));
}

/**
 * Move the item at `from` to index `to` in a copy of `list` (clamped). Used by
 * the keyboard / move-up-down / drag reorder controls.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const n = list.length;
  if (from < 0 || from >= n) return list.slice();
  const dest = Math.max(0, Math.min(n - 1, to));
  const copy = list.slice();
  const [it] = copy.splice(from, 1);
  copy.splice(dest, 0, it);
  return copy;
}
