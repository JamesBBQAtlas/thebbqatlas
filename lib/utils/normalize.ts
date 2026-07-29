/**
 * Lenient input normalisers for the public submit form (and anywhere else we
 * take a URL/handle from a human). The goal is to accept whatever people
 * naturally type and store a clean canonical value — never reject for a missing
 * scheme or an @ sign. Pure functions, safe to import in client components.
 */

/**
 * Normalise a website to a full https:// URL. Accepts:
 *   willsbbq.de · www.willsbbq.de · http://willsbbq.de · https://willsbbq.de
 *   · with or without a path/trailing slash.
 * Rules: trim; if no http(s):// scheme, prepend https://; keep www exactly as
 * typed (don't add or strip). Returns the normalised URL, or null for genuine
 * nonsense (no dot + plausible TLD).
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/\s+/g, ""); // no spaces in a URL
  s = s.replace(/^\/\//, ""); // protocol-relative → drop, scheme added below
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    // Plausible hostname: at least one dot and a 2+ char TLD.
    if (!u.hostname.includes(".")) return null;
    if (!/\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Normalise an Instagram handle. Accepts @willsbbq, willsbbq, or a full
 * instagram.com/willsbbq URL → returns the bare lowercase handle (no @), or
 * null if nothing usable.
 */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  let h = (raw ?? "").trim();
  if (!h) return null;
  const m = h.match(/instagram\.com\/([^/?#]+)/i);
  if (m) h = m[1];
  h = h
    .replace(/^@/, "")
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();
  if (!h || /\s/.test(h) || h === "explore") return null;
  return h;
}
