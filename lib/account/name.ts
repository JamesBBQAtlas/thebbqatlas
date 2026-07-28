/**
 * Resolve a person's display name consistently across the app. Prefer a name
 * the user genuinely chose; otherwise use the OAuth profile name; only as a last
 * resort fall back to a tidied email local-part (never the raw "jwdoyle").
 */

interface NameUser {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function tidyEmailLocal(local: string | null): string | null {
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Best display name for a user. A stored display_name wins UNLESS it's just the
 * email local-part (the old auto-default) — in which case we use the OAuth name.
 * Order: chosen display_name → full_name → name → given_name → tidied email.
 */
export function resolveDisplayName(
  user: NameUser | null | undefined,
  storedDisplayName?: string | null
): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const emailLocal = user?.email ? user.email.split("@")[0] : null;
  const stored = str(storedDisplayName);
  if (stored && (!emailLocal || stored.toLowerCase() !== emailLocal.toLowerCase())) {
    return stored;
  }
  return (
    str(meta.full_name) ??
    str(meta.name) ??
    str(meta.given_name) ??
    tidyEmailLocal(emailLocal) ??
    "Member"
  );
}

/** First token of a name — for a warm greeting ("Welcome, James."). */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
