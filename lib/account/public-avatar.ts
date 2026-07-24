import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public avatars, served the privacy-preserving way. Migration 018 keeps
 * profiles.avatar_url NON-anon-readable, and the `avatars` bucket is private
 * (F-08), so we read the path and mint a short-lived signed URL with the
 * SERVICE-ROLE client, server-side only. The raw storage path never reaches the
 * public API — only an expiring image URL does, and only when the user actually
 * uploaded a photo. Everything here is fail-soft (returns nothing on error) and
 * safe on ISR/statically-generated pages.
 */

/** Sign uploaded avatars for many users at once. Returns id → signed URL. */
export async function getPublicAvatarSignedUrls(
  userIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || ids.length === 0) return out;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, avatar_url")
      .in("id", ids);
    const rows = (data ?? []) as { id: string; avatar_url: string | null }[];
    await Promise.all(
      rows.map(async (r) => {
        const path = r.avatar_url;
        if (!path) return;
        // Legacy absolute URLs render directly; storage paths get signed.
        if (/^https?:\/\//i.test(path)) {
          out.set(r.id, path);
          return;
        }
        const { data: signed } = await admin.storage
          .from("avatars")
          .createSignedUrl(path, 60 * 60);
        if (signed?.signedUrl) out.set(r.id, signed.signedUrl);
      })
    );
  } catch {
    /* fail soft — callers fall back to the initials badge */
  }
  return out;
}

/** Sign a single user's uploaded avatar, or null if none. */
export async function getPublicAvatarSignedUrl(
  userId: string
): Promise<string | null> {
  const map = await getPublicAvatarSignedUrls([userId]);
  return map.get(userId) ?? null;
}

// Deterministic initials-badge palette (brand-tinted). Full literal class
// strings so Tailwind's JIT keeps them.
const BADGE_PALETTE = [
  "bg-brand-gold/15 text-brand-gold",
  "bg-brand-sienna/15 text-brand-sienna",
  "bg-brand-gold/10 text-brand-gold-light",
  "bg-brand-sienna/20 text-brand-sienna-light",
  "bg-surface-2 text-text-primary",
] as const;

/**
 * The fallback shown when a user has no uploaded photo: their first initial on a
 * colour picked deterministically from a seed (the username), so each person
 * gets a stable, distinct badge.
 */
export function avatarBadge(seed: string): { initial: string; className: string } {
  const s = (seed || "?").trim();
  const initial = (s[0] || "?").toUpperCase();
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return { initial, className: BADGE_PALETTE[hash % BADGE_PALETTE.length] };
}
