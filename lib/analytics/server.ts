import "server-only";
import { createHash } from "node:crypto";

/**
 * Server-side analytics helpers — privacy-preserving session identity and bot
 * detection for the venue-view / click / impression capture layer (Fable C-1).
 * No raw IP is ever stored: the session hash is a salted one-way digest of
 * IP + user-agent + UTC day, so it can dedupe a person's views within a day
 * without being reversible or persistent across days.
 */

const BOT_RE =
  /bot\b|crawl|spider|slurp|bingpreview|googlebot|yandex|baiduspider|duckduck|facebookexternalhit|embedly|quora|pinterest|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|headless|lighthouse|chrome-lighthouse|screaming frog|curl\/|wget\/|python-requests|axios\/|node-fetch|go-http-client|okhttp|java\//i;

/** Obvious non-human traffic (also treats a missing UA as a bot). */
export function isBotUA(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

const SALT = process.env.ANALYTICS_SALT || "bbqatlas-analytics";

/** Salted, one-way daily session hash. Returns null when there's nothing to key on. */
export function sessionHash(
  ip: string | null,
  ua: string | null,
  day: string
): string | null {
  if (!ip && !ua) return null;
  return createHash("sha256")
    .update(`${SALT}|${day}|${ip ?? ""}|${ua ?? ""}`)
    .digest("hex")
    .slice(0, 40);
}

export interface AnalyticsCtx {
  ua: string | null;
  ip: string | null;
  country: string | null;
  referrer: string | null;
  is_bot: boolean;
  session_hash: string | null;
  /** UTC day (YYYY-MM-DD) — the dedupe bucket. */
  day: string;
}

/** Derive the analytics context from a request's headers (server render or route). */
export function analyticsCtx(h: Headers): AnalyticsCtx {
  const ua = h.get("user-agent");
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const country = h.get("x-vercel-ip-country") || null;
  const referrer = h.get("referer") || null;
  const day = new Date().toISOString().slice(0, 10);
  return {
    ua,
    ip,
    country,
    referrer,
    is_bot: isBotUA(ua),
    session_hash: sessionHash(ip, ua, day),
    day,
  };
}
