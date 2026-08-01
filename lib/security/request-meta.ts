/**
 * Extract the caller's network provenance from a request's edge headers.
 * Cloudflare-first (we sit behind it), with Vercel geo + standard proxy headers
 * as fallbacks so this works whether the app is served through Cloudflare or hit
 * directly. `country` is the 2-letter ISO code (CF-IPCountry / x-vercel-ip-country).
 */
export interface RequestMeta {
  ip: string | null;
  country: string | null;
  userAgent: string | null;
  ray: string | null;
  asn: string | null;
}

const firstIp = (v: string | null): string | null =>
  v ? (v.split(",")[0]?.trim() || null) : null;

export function requestMeta(req: Request): RequestMeta {
  const h = req.headers;
  const ip =
    h.get("cf-connecting-ip") ||
    firstIp(h.get("x-real-ip")) ||
    firstIp(h.get("x-forwarded-for")) ||
    null;
  const country =
    h.get("cf-ipcountry") || h.get("x-vercel-ip-country") || null;
  return {
    ip,
    // Cloudflare uses "XX" for unknown and "T1"/"T2" for Tor — keep verbatim.
    country: country && country !== "XX" ? country : null,
    userAgent: h.get("user-agent"),
    ray: h.get("cf-ray"),
    // ASN is only present with Cloudflare Enterprise/Bot Management; capture if so.
    asn: h.get("cf-asn") || h.get("x-asn") || null,
  };
}
