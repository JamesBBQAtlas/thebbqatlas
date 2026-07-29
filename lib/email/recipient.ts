import type { SupabaseClient } from "@supabase/supabase-js";

const firstToken = (n: string | null | undefined): string | null => {
  const t = (n ?? "").trim().split(/\s+/)[0];
  return t || null;
};

/**
 * Pure version of the greeting-name policy, from already-loaded data. Source of
 * truth = display_name; ignores an email-local-part display_name; falls back to
 * OAuth metadata; returns null (→ nameless greeting) when there's no real name.
 * Never returns the email local-part or a @username.
 */
export function emailFirstNameFrom(opts: {
  displayName?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const emailLocal = opts.email ? opts.email.split("@")[0].toLowerCase() : null;
  let name = (opts.displayName ?? "").trim() || null;
  if (name && emailLocal && name.toLowerCase() === emailLocal) name = null;
  if (!name) {
    const meta = opts.metadata ?? {};
    const cand = [meta.full_name, meta.name, meta.given_name].find(
      (v) => typeof v === "string" && v.trim()
    ) as string | undefined;
    name = cand?.trim() || null;
  }
  return firstToken(name);
}

/**
 * The FIRST name to greet in a transactional email (policy — all emails).
 * Source of truth = `profiles.display_name`; falls back to OAuth full_name/name
 * for a profile not yet backfilled. Never uses the email local-part or a
 * @username. Returns null when there's no real name on file → the template
 * greets with no name (in-voice), never "Welcome, ." or "Welcome, <prefix>".
 */
export async function emailFirstName(
  admin: SupabaseClient,
  opts: { userId?: string | null; email?: string | null }
): Promise<string | null> {
  if (!opts.userId) return null;
  const { data: prof } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", opts.userId)
    .maybeSingle();

  // Try display_name first (ignoring an email-prefix default); if that yields
  // nothing, fall back to the OAuth metadata for an un-backfilled profile.
  const fromProfile = emailFirstNameFrom({
    displayName: prof?.display_name ?? null,
    email: opts.email,
  });
  if (fromProfile) return fromProfile;

  try {
    const { data } = await admin.auth.admin.getUserById(opts.userId);
    return emailFirstNameFrom({
      email: opts.email,
      metadata: (data?.user?.user_metadata ?? null) as Record<string, unknown> | null,
    });
  } catch {
    return null;
  }
}
