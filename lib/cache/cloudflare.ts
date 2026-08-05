/**
 * Best-effort Cloudflare edge-cache purge. We sit behind Cloudflare, so an
 * unpublish/schedule change at the origin can still be masked by a stale edge
 * copy until Cloudflare re-fetches. This purges specific URLs on demand.
 *
 * Env-gated and non-throwing: if CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID are
 * not set, it no-ops (returns false) rather than failing the caller — so it's
 * safe to call unconditionally, and "turns on" the moment the two env vars are
 * provided. A token needs the "Zone → Cache Purge" permission for the zone.
 */
const CF_API = "https://api.cloudflare.com/client/v4";

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://thebbqatlas.com").replace(/\/+$/, "");
}

/** Absolute URLs for a list of site paths (Cloudflare purges by full URL). */
export function siteUrls(paths: string[]): string[] {
  const base = siteBase();
  return paths.map((p) => `${base}${p.startsWith("/") ? p : `/${p}`}`);
}

/** Purge the given absolute URLs from Cloudflare's edge cache. Best-effort. */
export async function purgeCloudflare(urls: string[]): Promise<boolean> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zone || !urls.length) return false;
  try {
    const res = await fetch(`${CF_API}/zones/${zone}/purge_cache`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: urls.slice(0, 30) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
