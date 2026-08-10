import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { affiliateUrlEarns } from "@/lib/affiliate";
import { classifyHttp, classifyChannelHealth, type LinkStatus } from "@/lib/media/link-health-util";
import { extractYouTubeVideoId, extractYouTubeHandle, extractYouTubeChannelId } from "@/lib/media/wrl-url";

export { classifyHttp, type LinkStatus };

/**
 * Part C — library link-health checker. A naive "HTTP 200 = fine" check is NOT
 * enough for these platforms (a terminated YouTube channel, a dead Amazon ASIN
 * and a pulled podcast all still return 200 with a "not found" body), so each
 * kind is checked its own way. Crucially, a transient failure (timeout / 5xx /
 * network error) is reported as `unchecked` (retry later), NEVER `broken`, so we
 * don't raise false "dead" flags.
 */
export interface LinkHealth {
  status: LinkStatus;
  code: number | null;
  note: string | null;
}

export interface CheckablePick {
  id: string;
  kind: "youtube" | "book" | "podcast" | "video";
  url: string;
  gear_link?: string | null;
  links?: Record<string, string> | null;
}

const UA =
  "TheBBQAtlasBot/1.0 (+https://thebbqatlas.com/about; library link-health check)";

/** Fetch with a timeout + realistic UA. Returns null on network error/timeout. */
async function timedFetch(
  url: string,
  opts: { method?: "HEAD" | "GET"; timeoutMs?: number; redirect?: RequestRedirect } = {}
): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      redirect: opts.redirect ?? "follow",
      headers: { "user-agent": UA, accept: "text/html,application/json,*/*" },
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Amazon soft-404 body markers (a dead ASIN returns 200 with these). */
const AMAZON_DEAD = /(Looking for something\?|we couldn't find that page|Page Not Found|The Web address you entered is not a functioning page|dogs of amazon|Sorry! We couldn't find that page)/i;

/** YouTube "channel gone" body markers as a fallback to the oEmbed check. */
const YT_DEAD = /(This channel does not exist|has been terminated|account associated with this video has been terminated|isn't available)/i;

/**
 * A single VIDEO — oEmbed is the right tool (it's what oEmbed supports). A gone
 * video 404s; a live one 200s. Transient/5xx → unchecked, never broken.
 */
async function checkYouTubeVideo(url: string): Promise<LinkHealth> {
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await timedFetch(oembed, { method: "GET", timeoutMs: 10_000 });
  if (res === null) return { status: "unchecked", code: null, note: "network error — will retry" };
  if (res.status === 200) return { status: "ok", code: 200, note: null };
  if (res.status === 404 || res.status === 401)
    return { status: "broken", code: res.status, note: "video unavailable (oEmbed 404)" };
  if (res.status >= 500) return { status: "unchecked", code: res.status, note: "YouTube 5xx — will retry" };
  // Fallback: fetch the watch page and look for the "unavailable" copy.
  const page = await timedFetch(url, { method: "GET", timeoutMs: 10_000 });
  if (page === null) return { status: "unchecked", code: null, note: "network error — will retry" };
  const body = await page.text().catch(() => "");
  if (YT_DEAD.test(body)) return { status: "broken", code: page.status, note: "video unavailable" };
  return { status: classifyHttp(page.status), code: page.status, note: null };
}

/**
 * A CHANNEL — oEmbed does NOT support channels (a live channel always 404s
 * there), which is exactly what false-flagged the whole Watch section. Validate
 * via the YouTube Data API `channels.list` (part=id, forHandle= / id=) with the
 * existing YOUTUBE_API_KEY: 200 + a matching item ⇒ OK, empty items ⇒ broken,
 * any API/network error ⇒ unchecked (never broken). With no key, fall back to a
 * plain page GET treated as OK on 2xx/3xx unless the "channel gone" copy shows.
 */
async function checkYouTubeChannel(url: string): Promise<LinkHealth> {
  const key = process.env.YOUTUBE_API_KEY;
  const channelId = extractYouTubeChannelId(url);
  const handle = extractYouTubeHandle(url);
  if (key && (channelId || handle)) {
    const selector = channelId ? `id=${encodeURIComponent(channelId)}` : `forHandle=${encodeURIComponent(handle!)}`;
    const res = await timedFetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&${selector}&key=${key}`,
      { method: "GET", timeoutMs: 10_000 }
    );
    if (res === null) return classifyChannelHealth({ kind: "network" });
    if (!res.ok) return classifyChannelHealth({ kind: "api_error", code: res.status });
    const data = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
    if (!data) return classifyChannelHealth({ kind: "api_error", code: res.status });
    return classifyChannelHealth({ kind: "items", count: Array.isArray(data.items) ? data.items.length : 0 });
  }
  // No API key (or an unparseable URL) — page fallback.
  const page = await timedFetch(url, { method: "GET", timeoutMs: 10_000 });
  if (page === null) return classifyChannelHealth({ kind: "network" });
  const body = await page.text().catch(() => "");
  return classifyChannelHealth({ kind: "page", status: page.status, dead: YT_DEAD.test(body) });
}

async function checkAmazon(url: string): Promise<LinkHealth> {
  const res = await timedFetch(url, { method: "GET", timeoutMs: 12_000 });
  if (res === null) return { status: "unchecked", code: null, note: "network error — will retry" };
  if (res.status >= 500) return { status: "unchecked", code: res.status, note: "Amazon 5xx — will retry" };
  if (res.status >= 400) return { status: "broken", code: res.status, note: "ASIN not found" };
  const body = await res.text().catch(() => "");
  if (AMAZON_DEAD.test(body)) return { status: "broken", code: 200, note: "ASIN not found (soft 404)" };
  return { status: "ok", code: res.status, note: null };
}

async function checkGeneric(url: string): Promise<LinkHealth> {
  // HEAD first (cheap); fall back to GET when HEAD is unsupported (405/501).
  let res = await timedFetch(url, { method: "HEAD", timeoutMs: 10_000 });
  if (res && (res.status === 405 || res.status === 501 || res.status === 403)) {
    res = await timedFetch(url, { method: "GET", timeoutMs: 12_000 });
  }
  if (res === null) return { status: "unchecked", code: null, note: "network error — will retry" };
  const status = classifyHttp(res.status);
  return {
    status,
    code: res.status,
    note: status === "broken" ? "not found" : status === "unchecked" ? "server error — will retry" : null,
  };
}

/** Check a single library item, platform-aware. */
export async function checkMediaLink(pick: CheckablePick): Promise<LinkHealth> {
  const isAmazon = (u: string | null | undefined) => Boolean(u && /(^|\.)amazon\./i.test(u));
  try {
    if (pick.kind === "youtube" || pick.kind === "video") {
      // Dispatch by what the URL actually IS, not just the stored kind, so a
      // mis-filed row (a video saved as 'youtube', or vice-versa) still checks
      // correctly. A channel has an @handle or /channel/UC…; a video has an id.
      const looksVideo =
        Boolean(extractYouTubeVideoId(pick.url)) &&
        !extractYouTubeHandle(pick.url) &&
        !extractYouTubeChannelId(pick.url);
      const isChannel = pick.kind === "youtube" && !looksVideo;
      return isChannel ? await checkYouTubeChannel(pick.url) : await checkYouTubeVideo(pick.url);
    }
    if (pick.kind === "book") {
      // The affiliate/buy link is what visitors click; check that. A dead book
      // link is BOTH a link-health and an earn problem.
      const buy = pick.gear_link || pick.url;
      const health = isAmazon(buy) ? await checkAmazon(buy) : await checkGeneric(buy);
      if (health.status === "ok" && isAmazon(buy) && !affiliateUrlEarns(buy)) {
        return { status: "broken", code: health.code, note: "book link earns $0 — fix the affiliate URL" };
      }
      return health;
    }
    // podcast (or anything else) → verify the page/feed resolves.
    return await checkGeneric(pick.url);
  } catch {
    return { status: "unchecked", code: null, note: "checker error — will retry" };
  }
}

export interface CheckSummary {
  total: number;
  ok: number;
  broken: number;
  redirected: number;
  unchecked: number;
  brokenItems: { id: string; note: string | null }[];
}

/**
 * Check a set of library items (all, or a given id list), throttled and polite,
 * and persist link_status/code/checked_at/note on each. Returns a summary.
 */
export async function checkLibraryLinks(
  db: SupabaseClient,
  opts: { ids?: string[]; delayMs?: number } = {}
): Promise<CheckSummary> {
  let q = db
    .from("media_picks")
    .select("id, kind, url, gear_link, links")
    .order("kind");
  if (opts.ids?.length) q = q.in("id", opts.ids);
  const { data } = await q;
  const picks = (data ?? []) as CheckablePick[];

  const summary: CheckSummary = { total: picks.length, ok: 0, broken: 0, redirected: 0, unchecked: 0, brokenItems: [] };
  const nowIso = new Date().toISOString();

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const health = await checkMediaLink(pick);
    summary[health.status] += 1;
    if (health.status === "broken") summary.brokenItems.push({ id: pick.id, note: health.note });
    await db
      .from("media_picks")
      .update({
        link_status: health.status,
        link_status_code: health.code,
        link_checked_at: nowIso,
        link_note: health.note,
      })
      .eq("id", pick.id);
    // Politeness throttle between requests.
    if (i < picks.length - 1) await new Promise((r) => setTimeout(r, opts.delayMs ?? 400));
  }
  return summary;
}
